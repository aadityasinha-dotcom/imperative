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

export interface IConfigVault {
    load: (key: string) => Promise<any>;
    save: (key: string, value: string) => Promise<void>;
    // TODO Should we remove name since we removed the "managed by " placeholder?
    name: string;
};