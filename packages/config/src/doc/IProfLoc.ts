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

/**
 * This enum represents the type of location for a property.
 * Note that properties with location types of ENV and DEFAULT
 * cannot be stored back to disk. Thus the consumer app must
 * make its own decision about where to store the property.
 */
export enum ProfLocType {
    OLD_PROFILE = 0,    // an old-school profile
    TEAM_CONFIG,        // a team configuration
    ENV,                // an environment variable
    DEFAULT             // the default value from a profile definition
};

/** The attributes used to identify the location of a given property */
export interface IProfLoc {
    /**
     * The type of location for this property
     */
    locType:    ProfLocType.OLD_PROFILE |
                ProfLocType.TEAM_CONFIG |
                ProfLocType.ENV |
                ProfLocType.DEFAULT;

    /**
     * For OLD_PROFILE and TEAM_CONFIG, this is the path to
     * the file on disk which contains the argument.
     * For ENV, this is the name of the environment variable.
     * This is not used for DEFAULT.
     */
    osLoc?: string;

    /**
     * For SOURCE_TEAM_CONFIG, this is the dotted path into
     * the JSON configuration object for the profile.
     * This property is not used for SOURCE_OLD_PROFILE, because
     * the old-shool profiles use a simple ArgumentName: value pair.
     * This property is also not used for ENV or DEFAULT.
     */
    jsonLoc?: string;
};