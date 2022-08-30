/*
* This program and the accompanying materials are made available under the terms of the
* Eclipse Public License v2.0 which accompanies this distribution, and is available at
* https://www.eclipse.org/legal/epl-v20.html
*
* SPDX-License-Identifier: EPL-2.0
*
* Copyright Contributors to the Zowe Project.
*
*/

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync, StdioOptions } from "child_process";

import { IO } from "../../../../../io";
import { ImperativeConfig, TextUtils} from "../../../../../utilities";
import { ItemId, IProbTest, probTests } from "./EnvItems";

/**
 * This interface represents the result from getEnvItemVal().
 */
export interface IGetItemVal {
    itemVal: string;        // Value of the item. Null when we cannot get the value.
    itemValMsg: string;     // Message to display the item's value.
    itemProbMsg: string;    /* Message to display any problems with the value.
                             * Empty string (length 0) when there are no problems.
                             */
}

/**
 * This class encapulates operations for Zowe CLI environment information.
 * We use the term environment loosely. Sometimes it is an environment variable.
 * It can also be something in the runtime environment, like version of NodeJS.
 */
export class EnvQuery {
    private static readonly divider = `______________________________________________${os.EOL}`;
    private static readonly indent = "    ";
    private static readonly eolMatch: string = "(\r?\n|\n)";
    private static readonly allEolRegex = new RegExp(EnvQuery.eolMatch, "g");
    private static readonly lastEolRegex = new RegExp(EnvQuery.eolMatch + "$");

    // __________________________________________________________________________
    /**
     * For the specified itemId, get its value.
     *
     * @param itemId ID of the environmental item for which we want get the value.
     * @returns An object with the item value, a display message, and a problem message.
     */
    public static getEnvItemVal(itemId: ItemId): IGetItemVal {
        const getResult: IGetItemVal = { itemVal: null, itemValMsg: "", itemProbMsg: "" };
        switch(itemId) {
            case ItemId.ZOWE_VER: {
                EnvQuery.getZoweVer(getResult);
                break;
            }
            case ItemId.NODEJS_VER: {
                getResult.itemVal = process.versions.node;
                getResult.itemValMsg = "NodeJS version = " + getResult.itemVal;
                break;
            }
            case ItemId.NVM_VER: {
                getResult.itemVal = EnvQuery.getCmdOutput("nvm", ["version"]);
                getResult.itemValMsg = "Node Version Manager version = " + getResult.itemVal;
                break;
            }
            case ItemId.PLATFORM: {
                getResult.itemVal = os.platform();
                getResult.itemValMsg = "O.S. platform = " + getResult.itemVal;
                break;
            }
            case ItemId.ARCHITECTURE: {
                getResult.itemVal = os.arch();
                getResult.itemValMsg = "O.S. architecture = " + getResult.itemVal;
                break;
            }
            case ItemId.OS_PATH: {
                getResult.itemVal = process.env.PATH;
                getResult.itemValMsg = os.EOL + "O.S. PATH = " + getResult.itemVal;
                break;
            }
            case ItemId.ZOWE_CLI_HOME: {
                getResult.itemVal = process.env.ZOWE_CLI_HOME;
                if (getResult.itemVal === undefined) {
                    getResult.itemVal += os.EOL + EnvQuery.indent + "Default = " +
                        path.normalize(ImperativeConfig.instance.cliHome);
                }
                getResult.itemValMsg = os.EOL + "ZOWE_CLI_HOME = " + getResult.itemVal;
                break;
            }
            case ItemId.ZOWE_APP_LOG_LEVEL: {
                getResult.itemVal = process.env.ZOWE_APP_LOG_LEVEL;
                getResult.itemValMsg = "ZOWE_APP_LOG_LEVEL = " + getResult.itemVal;
                break;
            }
            case ItemId.ZOWE_IMPERATIVE_LOG_LEVEL: {
                getResult.itemVal = process.env.ZOWE_IMPERATIVE_LOG_LEVEL;
                getResult.itemValMsg = "ZOWE_IMPERATIVE_LOG_LEVEL = " + getResult.itemVal;
                break;
            }
            case ItemId.OTHER_ZOWE_VARS: {
                EnvQuery.getOtherZoweEnvVars(getResult);
                break;
            }
            case ItemId.NPM_VER: {
                EnvQuery.getNpmInfo(getResult);
                break;
            }
            case ItemId.ZOWE_CONFIG_TYPE: {
                EnvQuery.getConfigInfo(getResult);
                break;
            }
            case ItemId.ZOWE_PLUGINS: {
                getResult.itemValMsg = EnvQuery.divider +
                    EnvQuery.getCmdOutput("zowe", ["plugins", "list"]) + EnvQuery.divider;
                break;
            }
            default: {
                getResult.itemProbMsg = "An unknown item ID was supplied = " + itemId;
                return getResult;
            }
        }

        getResult.itemProbMsg = EnvQuery.getEnvItemProblems(itemId, getResult.itemVal);
        return getResult;
    }

    // __________________________________________________________________________
    /**
     * Detect if a specified problem test finds a problem for the specified value.
     *
     * @param itemVal The value of the environmental item.
     * @param probTest A problem test to be evaluated.
     *
     * @returns True if we find a problem. False otherwise.
     */
    private static detectProbVal(value: string, probTest: IProbTest): boolean {
        /* eslint-disable unused-imports/no-unused-vars */
        const semver = require('semver');
        const probExprWithVals = probTest.probExpr.replaceAll("{val}", value);
        return eval(probExprWithVals);
    }

    // __________________________________________________________________________
    /**
     * Run a command that displays output.
     *
     * @param cmdToRun The command name to be run.
     * @param args The arguments to the command.
     *
     * @return The output of the command.
     */
    private static getCmdOutput(cmdToRun: string, args: string[]): string {
        let cmdOutput: string = "";
        const ioOpts: StdioOptions = ["pipe", "pipe", "pipe"];
        try {
            const spawnResult = spawnSync(cmdToRun, args, {
                stdio: ioOpts,
                shell: true
            });
            if (spawnResult.stdout && spawnResult.stdout.length > 0) {
                // remove any trailing newline from the output
                cmdOutput = spawnResult.stdout.toString();
            } else {
                cmdOutput = cmdToRun + " does not appear to be installed.";
                if (spawnResult.stderr) {
                    cmdOutput += `${os.EOL}Reason = ` + spawnResult.stderr.toString();
                }
            }
        } catch (err) {
            cmdOutput = "Failed to run commmand = " + cmdToRun + " " + args.join(" ");
            if (err.message) {
                cmdOutput += `${os.EOL}Details = ` + err.message;
            }
            cmdOutput = TextUtils.chalk.red(cmdOutput);
        }

        // remove any trailing newline from the output
        cmdOutput = cmdOutput.replace(EnvQuery.lastEolRegex, "");

        if (cmdOutput.length == 0) {
            cmdOutput = "Failed to get any information from " + cmdToRun + " " + args.join(" ");
        }
        return cmdOutput;
    }

    // __________________________________________________________________________
    /**
     * Get information about the Zowe configuration.
     *
     * @param getResult The itemVal and itemValMsg properties are filled
     *                  by this function.
     */
    private static getConfigInfo(getResult: IGetItemVal): void {
        const teamCfg: string = "V2 Team Config";
        const v1Profiles = "V1 Profiles";
        if (ImperativeConfig.instance.config?.exists) {
            getResult.itemVal = teamCfg;
        } else {
            getResult.itemVal = v1Profiles;
        }

        getResult.itemValMsg = "Zowe daemon mode = ";
        if (ImperativeConfig.instance.loadedConfig.daemonMode) {
            getResult.itemValMsg += "on";

            // skip the exe version if our NodeJS zowe command gives help
            const exeVerOutput = EnvQuery.getCmdOutput("zowe", ["--version-exe"]);
            if (exeVerOutput.match(/DESCRIPTION/) == null) {
                getResult.itemValMsg += `${os.EOL}Zowe daemon executable version = ` + exeVerOutput;
            }
            getResult.itemValMsg += `${os.EOL}Default Zowe daemon executable directory = ` +
                path.normalize(ImperativeConfig.instance.cliHome + "/bin");

        } else {
            getResult.itemValMsg += "off";
        }
        getResult.itemValMsg += `${os.EOL}Zowe config type = ` + getResult.itemVal;

        if ( getResult.itemVal == teamCfg) {
            /* Display all relevant zowe team config files.
             * Replace colon at end of config file name and indent another level.
             */
            getResult.itemValMsg += `${os.EOL}Team config files in effect:${os.EOL}`;
            const cfgListOutput = EnvQuery.getCmdOutput("zowe", ["config", "list", "--locations"]);

            // extract all config file names from 'config list' command
            getResult.itemValMsg += EnvQuery.indent +
                cfgListOutput.match(/.*zowe\.config.*\.json:.*\n/g).join(EnvQuery.indent);

            // extract all available zowe profile names from 'config profiles' command
            getResult.itemValMsg += `Available profile names:${os.EOL}`;
            getResult.itemValMsg += EnvQuery.indent +
                EnvQuery.getCmdOutput("zowe", ["config", "profiles"])
                    .replace(EnvQuery.allEolRegex, "$1" + EnvQuery.indent) + os.EOL;

            // extract default profile names from previous'config list' command
            const escChar = "\x1B";
            const defaultsRegex = new RegExp(`.*defaults:(.*)${escChar}.*autoStore:.*`, "ms");
            getResult.itemValMsg += "Default profile names: " +
                cfgListOutput.replace(defaultsRegex, "$1");
        } else {
            // display V1 profile information
            getResult.itemValMsg += `${os.EOL}Available profiles:${os.EOL}`;
            const v1ProfilesDir = path.normalize(ImperativeConfig.instance.cliHome + "/profiles");
            if (IO.isDir(v1ProfilesDir)) {
                // read all of the subdirectories of the profiles directory
                fs.readdirSync(v1ProfilesDir).forEach((nextProfileTypeNm) => {
                    const profileTypeDir = path.normalize(v1ProfilesDir + "/" + nextProfileTypeNm);
                    let profilesOfCurrType: string = "";

                    // is the next candidate for nextProfileTypeNm a directory?
                    if (IO.isDir(profileTypeDir)) {
                        // does the next profile type directory have any profiles?
                        fs.readdirSync(profileTypeDir).forEach((nextProfileNm) => {
                            // exclude the meta files
                            if (nextProfileNm.match(/.*_meta.yaml/) != null) {
                                return;
                            }
                            profilesOfCurrType += EnvQuery.indent + EnvQuery.indent +
                                nextProfileNm.replace(".yaml", "") + os.EOL;
                        });
                    }

                    // did we find any profiles?
                    if (profilesOfCurrType.length > 0) {
                        getResult.itemValMsg += EnvQuery.indent + nextProfileTypeNm +
                        " profiles: " + os.EOL + profilesOfCurrType;

                    }
                });
            }
        }

        // add indent to each line
        getResult.itemValMsg  = EnvQuery.divider + "Zowe CLI configuration information:" +
            os.EOL + os.EOL + EnvQuery.indent +
            getResult.itemValMsg.replace(EnvQuery.allEolRegex, "$1" + EnvQuery.indent);
    }

    // __________________________________________________________________________
    /**
     * For the specified itemId, get any known problems.
     *
     * @param itemId ID of the environmental item for which we want to detect problems.
     * @param itemVal The value of the environmental item.
     * @returns A string with a message about the problems. An empty string if no problems are detected.
     */
    private static getEnvItemProblems(itemId: ItemId, itemVal: string): string {
        let probMsgs: string = "";
        for (const nextProbTest of probTests) {
            if (itemId == nextProbTest.itemId) {
                if (EnvQuery.detectProbVal(itemVal, nextProbTest)) {
                    if (probMsgs.length > 0) {
                        probMsgs += os.EOL;
                    }
                    probMsgs += nextProbTest.probMsg;
                }
            }
        }
        return probMsgs;
    }

    // __________________________________________________________________________
    /**
     * Get information about the NPM configuration.
     *
     * @param getResult The itemVal and itemValMsg properties are filled
     *                  by this function.
     */
    private static getNpmInfo(getResult: IGetItemVal): void {
        getResult.itemVal = EnvQuery.getCmdOutput("npm", ["--version"]);
        getResult.itemValMsg  = `${os.EOL}NPM version = ` + EnvQuery.getCmdOutput("npm", ["config", "get", "npm-version"]);
        getResult.itemValMsg += `${os.EOL}Shell = ` + EnvQuery.getCmdOutput("npm", ["config", "get", "shell"]);
        getResult.itemValMsg += `${os.EOL}Global prefix = ` + EnvQuery.getCmdOutput("npm", ["prefix", "-g"]);
        getResult.itemValMsg += os.EOL + EnvQuery.indent + "The directory above contains the Zowe NodeJs command script.";
        getResult.itemValMsg += `${os.EOL}Global root node modules = ` + EnvQuery.getCmdOutput("npm", ["root", "-g"]);
        getResult.itemValMsg += `${os.EOL}Global config = ` + EnvQuery.getCmdOutput("npm", ["config", "get", "globalconfig"]);
        getResult.itemValMsg += `${os.EOL}Local prefix = ` + EnvQuery.getCmdOutput("npm", ["prefix"]);
        getResult.itemValMsg += `${os.EOL}Local root node modules = ` + EnvQuery.getCmdOutput("npm", ["root"]);
        getResult.itemValMsg += `${os.EOL}User config = ` + EnvQuery.getCmdOutput("npm", ["config", "get", "userconfig"]);
        getResult.itemValMsg += os.EOL + os.EOL + EnvQuery.getCmdOutput("npm", ["config", "list"]).match(
            /.*registry =.*\n|"project.*\n|node bin location.*\n|cwd.*\n|HOME.*\n/g
        ).join("");

        // add indent to each line
        getResult.itemValMsg  = EnvQuery.divider + "NPM information:" + os.EOL+ EnvQuery.indent +
            getResult.itemValMsg.replace(EnvQuery.allEolRegex, "$1" + EnvQuery.indent);
    }

    // __________________________________________________________________________
    /**
     * Get other Zowe variables, beyond the ones we check for problem values.
     *
     * @param getResult The itemValMsg property is filled by this function.
     *                  The itemVal property is given no value by this function.
     */
    private static getOtherZoweEnvVars(getResult: IGetItemVal): void {
        getResult.itemValMsg = "";
        const envVars = process.env;
        for (const nextVar of Object.keys(envVars)) {
            if (nextVar.startsWith("ZOWE_") && nextVar != "ZOWE_CLI_HOME" &&
                nextVar != "ZOWE_APP_LOG_LEVEL" && nextVar != "ZOWE_IMPERATIVE_LOG_LEVEL")
            {
                getResult.itemValMsg += nextVar + " = " ;
                if (nextVar.toUpperCase().includes("PASSWORD") ||
                    nextVar.toUpperCase().includes("TOKEN"))
                {
                    getResult.itemValMsg += "******";
                } else {
                    getResult.itemValMsg += envVars[nextVar];

                }
                getResult.itemValMsg += os.EOL;
            }
        }

        // remove the last newline
        getResult.itemValMsg = getResult.itemValMsg.replace(EnvQuery.lastEolRegex, "");
        if (getResult.itemValMsg.length == 0) {
            getResult.itemValMsg += "No other 'ZOWE_' variables have been set.";
        }
    }

    // __________________________________________________________________________
    /**
     * Get the Zowe version number.
     *
     * @param getResult The itemVal and itemValMsg properties are filled
     *                  by this function.
     */
    private static getZoweVer(getResult: IGetItemVal): void {
        const cliPackageJson: any = ImperativeConfig.instance.callerPackageJson;
        if (Object.prototype.hasOwnProperty.call(cliPackageJson, "version")) {
            getResult.itemVal = cliPackageJson.version;
        }
        else {
            getResult.itemVal = "No version found in CLI package.json!";
        }
        getResult.itemValMsg =  EnvQuery.divider + "Zowe CLI version = " + getResult.itemVal;
    }
}
