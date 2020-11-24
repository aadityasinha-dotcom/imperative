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
import { Config } from "../src/Config";

const MY_APP = "my_app";

describe("Config tests", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("load", () => {
        beforeEach(() => {
            jest.spyOn(Config.prototype as any, "secureLoad").mockResolvedValue(undefined);
        });

        it("should load project user config", async () => {
            jest.spyOn(Config, "search").mockReturnValue(__dirname + "/__resources__/project.config.user.json");
            jest.spyOn(fs, "existsSync")
                .mockReturnValueOnce(true)      // Project user layer
                .mockReturnValueOnce(false)     // Project layer
                .mockReturnValueOnce(false)     // User layer
                .mockReturnValueOnce(false);    // Global layer
            const config = await Config.load(MY_APP);
            expect(config.properties).toMatchSnapshot();
        });

        it("should load project config", async () => {
            jest.spyOn(Config, "search").mockReturnValue(__dirname + "/__resources__/project.config.json");
            jest.spyOn(fs, "existsSync")
                .mockReturnValueOnce(false)     // Project user layer
                .mockReturnValueOnce(true)      // Project layer
                .mockReturnValueOnce(false)     // User layer
                .mockReturnValueOnce(false);    // Global layer
            const config = await Config.load(MY_APP);
            expect(config.properties).toMatchSnapshot();
        });

        it("should load user config", async () => {
            jest.spyOn(Config, "search").mockReturnValue(null);
            jest.spyOn(Config.prototype as any, "_home", "get").mockReturnValue(__dirname + "/__resources__");
            jest.spyOn(fs, "existsSync")
                .mockReturnValueOnce(false)     // Project user layer
                .mockReturnValueOnce(false)     // Project layer
                .mockReturnValueOnce(true)      // User layer
                .mockReturnValueOnce(false);    // Global layer
            const config = await Config.load(MY_APP);
            expect(config.properties).toMatchSnapshot();
        });

        it("should load global config", async () => {
            jest.spyOn(Config, "search").mockReturnValue(null);
            jest.spyOn(Config.prototype as any, "_home", "get").mockReturnValue(__dirname + "/__resources__");
            jest.spyOn(fs, "existsSync")
                .mockReturnValueOnce(false)     // Project user layer
                .mockReturnValueOnce(false)     // Project layer
                .mockReturnValueOnce(false)     // User layer
                .mockReturnValueOnce(true);     // Global layer
            const config = await Config.load(MY_APP);
            expect(config.properties).toMatchSnapshot();
        });

        it("should merge multiple config files", async () => {
            jest.spyOn(Config, "search")
                .mockReturnValueOnce(__dirname + "/__resources__/project.config.user.json")
                .mockReturnValueOnce(__dirname + "/__resources__/project.config.json");
            jest.spyOn(Config.prototype as any, "_home", "get").mockReturnValue(__dirname + "/__resources__");
            jest.spyOn(fs, "existsSync").mockReturnValue(true);
            const config = await Config.load(MY_APP);
            expect(config.properties).toMatchSnapshot();
        });
    });

    it("should find config that exists if any layers exist", () => {
        const config = new (Config as any)();
        config._layers = [
            { exists: false },
            { exists: true },
            { exists: false }
        ];
        expect(config.exists).toBe(true);
    });

    it("should not find config that exists if no layers exist", () => {
        const config = new (Config as any)();
        config._layers = [ { exists: false } ];
        expect(config.exists).toBe(false);
    });

    it("should provide a deep copy of layers", () => {
        const config = new (Config as any)();
        config._layers = {};
        config.layers.properties = {};
        expect(Object.keys(config._layers).length).toBe(0);
    });

    describe("set", () => {
        beforeEach(() => {
            jest.spyOn(Config, "search").mockReturnValue(__dirname + "/__resources__/project.config.user.json");
            jest.spyOn(fs, "existsSync").mockReturnValueOnce(true).mockReturnValue(false);
            jest.spyOn(Config.prototype as any, "secureLoad").mockResolvedValue(undefined);
        });

        it("should set boolean value in config", async () => {
            const config = await Config.load(MY_APP);
            config.set("profiles.fruit.profiles.apple.properties.ripe", "true");
            expect(config.properties.profiles.fruit.profiles.apple.properties.ripe).toBe(true);
        });

        it("should set integer value in config", async () => {
            const config = await Config.load(MY_APP);
            config.set("profiles.fruit.profiles.apple.properties.price", "2");
            expect(config.properties.profiles.fruit.profiles.apple.properties.price).toBe(2);
        });

        it("should append to array value in config", async () => {
            const config = await Config.load(MY_APP);
            config.set("profiles.fruit.properties.tags", []);
            config.set("profiles.fruit.properties.tags", "sweet");
            expect(config.properties.profiles.fruit.properties.tags.length).toBe(1);
            expect(config.properties.profiles.fruit.properties.tags[0]).toBe("sweet");
        });

        it("should set secure string value in config", async () => {
            const config = await Config.load(MY_APP);
            const layer = (config as any).layerActive();
            config.set("profiles.fruit.profiles.apple.properties.secret", "@ppl3", { secure: true });
            expect(config.properties.profiles.fruit.profiles.apple.properties.secret).toBe("@ppl3");
            expect(layer.properties.secure.length).toBe(1);
            expect(layer.properties.secure[0]).toBe("profiles.fruit.profiles.apple.properties.secret");
        });

        it("should set schema URI at top of config", async () => {
            const config = await Config.load(MY_APP);
            const layer = (config as any).layerActive();
            config.setSchema("./schema.json");
            const jsonText = JSON.stringify(layer.properties);
            expect(jsonText.match(/^{\s*"\$schema":/)).not.toBeNull();
        });

        it("should save schema to disk if object is provided", async () => {
            const writeFileSpy = jest.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
            const config = await Config.load(MY_APP);
            const schemaObj = { $schema: "./schema.json" };
            config.setSchema(schemaObj.$schema, schemaObj);
            expect(writeFileSpy).toHaveBeenCalledTimes(1);
            const jsonText = writeFileSpy.mock.calls[0][1];
            expect(jsonText).toBeDefined();
            expect(jsonText.match(/^{\s*"\$schema":/)).not.toBeNull();
        });

        it("should add new secure property to config", async () => {
            const config = await Config.load(MY_APP);
            const layer = (config as any).layerActive();
            const secureProp = "profiles.fruit.properties.secret";
            config.addSecure(secureProp);
            expect(layer.properties.secure.includes(secureProp)).toBe(true);
            config.addSecure(secureProp);
            expect(layer.properties.secure.filter((x: any) => x === secureProp).length).toBe(1);
        });
    });

    describe("secure", () => {
        it("should securely load all secure properties", async () => {
            throw new Error("TODO");
        });

        it("should securely save all secure properties", async () => {
            throw new Error("TODO");
        });
    });

    it("should find secure properties if any exist", () => {
        const config = new (Config as any)();
        config._layers = [
            {
                properties: { secure: [] }
            },
            {
                properties: { secure: [ "tokenValue" ] }
            },
            {
                properties: { secure: [] }
            }
        ];
        expect(config.secureFields()).toBe(true);
    });

    it("should not find secure properties if none exist", () => {
        const config = new (Config as any)();
        config._layers = [
            {
                properties: { secure: [] }
            }
        ];
        expect(config.secureFields()).toBe(false);
    });
});
