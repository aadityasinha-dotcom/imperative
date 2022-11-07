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

import { PMFConstants } from "./PMFConstants";
import * as path from "path";
import * as which from "which";
import { spawnSync, StdioOptions } from "child_process";
import { readFileSync } from "jsonfile";
import * as npmPackageArg from "npm-package-arg";
import * as pacote from "pacote";
import * as fs from "fs";
import { ImperativeError } from "../../../../error/src/ImperativeError";
import * as findUp from "find-up";
const npmCmd = cmdToRun();

/**
 * Common function that returns npm command as a string.
 *
 * @return {string} command with npm path
 */
export function cmdToRun() {
    return which.sync("npm");
}

/**
 * Common function that installs a npm package using the local npm cli.
 * @param {string} prefix Path where to install npm the npm package.
 *
 * @param {string} registry The npm registry to install from.
 *
 * @param {string} npmPackage The name of package to install.
 *
 * @return {string} command response
 *
 */
export function installPackages(prefix: string, registry: string, npmPackage: string): string {
    const pipe: StdioOptions = ["pipe", "pipe", process.stderr];
    try {
        const execOutput = spawnSync(npmCmd,
            [
                "install", npmPackage,
                "--prefix", prefix,
                "-g",
                "--registry", registry,
                "--legacy-peer-deps"
            ], {
                cwd: PMFConstants.instance.PMF_ROOT,
                stdio: pipe
            }
        );
        return execOutput.stdout.toString();
    } catch (err) {
        throw (err.message);
    }
}

/**
 * Get the registry to install to.
 *
 * @return {string}
 */
export function getRegistry(): string {
    try {
        const execOutput = spawnSync(npmCmd, [ "config", "get", "registry" ]);
        return execOutput.stdout.toString();
    } catch (err) {
        throw(err.message);
    }
}

/**
 * NPM login to be able to install from secure registry
 * @param {string} registry The npm registry to install from.
 */
export function npmLogin(registry: string) {
    try {
        spawnSync(npmCmd,
            [
                "adduser",
                "--registry", registry,
                "--always-auth",
                "--auth-type=legacy"
            ], {
                stdio: [0,1,2]
            }
        );
    } catch (err) {
        throw(err.message);
    }
}

/**
 * Fetch name and version of NPM package that was installed
 * @param pkgSpec The package name as specified on NPM install
 */
export async function getPackageInfo(pkgSpec: string): Promise<{ name: string, version: string }> {
    const pkgInfo = npmPackageArg(pkgSpec);
    if (pkgInfo.registry) {
        // We already know package name, so read name and version from package.json
        return readFileSync(path.join(PMFConstants.instance.PLUGIN_HOME_LOCATION, pkgInfo.name, "package.json"));
    } else {
        // Package name is unknown, so fetch name and version with pacote (npm SDK)
        return pacote.manifest(pkgSpec);
    }
}

/**
 * Normalize the NPM path so that it works between older and newer versions of node
 *
 * @return {string} The NPM path
 */
export function getNpmPath(): string {
    let npmPath = require.resolve("npm");
    if (npmPath.split(path.sep).includes("npm")) {
        npmPath = findUp.sync("npm", {cwd: npmPath, type: "directory"});
        if (npmPath != null && fs.existsSync(npmPath)) { return npmPath; }
    }
    throw new ImperativeError({msg: "Unable to resolve 'npm' path."});
}