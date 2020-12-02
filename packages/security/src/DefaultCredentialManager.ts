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

import { AbstractCredentialManager, SecureCredential } from "./abstract/AbstractCredentialManager";
import { ImperativeError } from "../../error";
import { Logger } from "../../logger";


/* tslint rule for missing dependency has been added to this file because it is up to
 * the host package to specify keytar as a dependency in order for this credential
 * manager to be used.
 *
 * This import is used for typing purposes only
 */
// tslint:disable-next-line:no-implicit-dependencies
import * as keytar from "keytar";

/**
 * Default Credential Manager is our implementation of the Imperative Credential Manager. This manager invokes methods
 * created by the keytar utility (https://www.npmjs.com/package/keytar) to access the secure credential vault on the
 * user's machine.
 *
 * ### Keychains Used by Keytar
 *
 * | OS | Vault |
 * |----|----------|
 * | Windows | Credential Vault |
 * | macOS | Keychain |
 * | Linux | Secret Sevice API/libsecret |
 *
 * ### Keytar must be installed by the app using imperative (like zowe-cli).
 *
 * On Linux, Keytar will not work out of the box without some additional
 * configuration to install libsecret. Keytar provides the following
 * documentation for Linux users to install libsecret:
 *
 * ---
 *
 * Depending on your distribution, you will need to run the following command:
 *
 * - Debian/Ubuntu: `sudo apt-get install libsecret-1-dev`
 * - Red Hat-based: `sudo yum install libsecret-devel`
 * - Arch Linux: `sudo pacman -S libsecret`
 */
export class DefaultCredentialManager extends AbstractCredentialManager {

  /**
   * The service name for our built-in credential manager.
   */
  public static readonly SVC_NAME = "Zowe";

  /**
   * Reference to the lazily loaded keytar module.
   */
  private keytar: typeof keytar;

  /**
   * Errors that occurred while loading keytar will be stored in here.
   *
   * Every method of this class should call the {@link checkForKeytar} method before proceeding. It
   * is this method that will check for keytar and throw this error if it was detected that keytar
   * wasn't loaded.
   *
   * @private
   */
  private loadError: ImperativeError;

  /**
   * Combined list of services that the plugin will go through
   */
  private allServices: string[];

  /**
   * Maximum credential length allowed by Windows 7 and newer.
   *
   * We don't support older versions of Windows where the limit is 512 bytes.
   */
  private readonly WIN32_CRED_MAX_STRING_LENGTH = 2560;

  /**
   * Pass-through to the superclass constructor.
   *
   * @param {string} service The service string to send to the superclass constructor.
   * @param {string} displayName The display name for this credential manager to send to the superclass constructor
   */
  constructor(service: string, displayName: string = "Zowe Built-in Credential Manager") {
    // Always ensure that a manager instantiates the super class, even if the
    // constructor doesn't do anything. Who knows what things might happen in
    // the abstract class initialization in the future.
    super(service, displayName);

    /* Gather all services. We will load secure properties for the first
     * successful service found in the order that they are placed in this array.
     */
    this.allServices = [this.service];

    /* In our current implementation, this.service is always
     * DefaultCredentialManager.SVC_NAME. We keep the logic below,
     * in case we re-enable overrides in the future.
     */
    if (this.service !== DefaultCredentialManager.SVC_NAME) {
        this.allServices.push(DefaultCredentialManager.SVC_NAME);
    }

    /* Previous services under which we will look for credentials.
     * We dropped @brightside/core because we no longer support the
     * lts-incremental version of the product.
     */
    this.allServices.push("@zowe/cli");
    this.allServices.push("Zowe-Plugin");
    this.allServices.push("Broadcom-Plugin");

  }

  /**
   * Called by {@link CredentialManagerFactory.initialize} before the freeze of the object. This
   * gives us a chance to load keytar into the class before we are locked down. If a load failure
   * occurs, we will store the error and throw it once a method of this class tries to execute. This
   * prevents a missing keytar module from stopping all operation of the cli.
   *
   * In the future, we could go even further to have keytar load into a sub-object of this class so
   * that the load doesn't hold up the main class execution.
   *
   * @returns {Promise<void>} A promise that the function has completed.
   */
  public async initialize(): Promise<void> {
      try {
        // Imperative overrides the value of process.mainModule.filename to point to
        // our calling CLI. Since our caller must supply keytar, we search for keytar
        // within our caller's path.
        const requireOpts = {};
        if (process.mainModule?.filename != null) {
          process.mainModule.paths = [ process.mainModule.filename ];
        }
        const keytarPath = require.resolve("keytar", requireOpts);
        // tslint:disable-next-line:no-implicit-dependencies
        this.keytar = await import(keytarPath);
      } catch (error) {
          this.loadError = new ImperativeError({
              msg: "Keytar not Installed",
              causeErrors: error
          });
      }
  }

  /**
   * Calls the keytar deletePassword service with {@link DefaultCredentialManager#service} and the
   * account passed to the function by Imperative.
   *
   * @param {string} account The account for which to delete the password
   *
   * @returns {Promise<void>} A promise that the function has completed.
   *
   * @throws {@link ImperativeError} if keytar is not defined.
   */
  protected async deleteCredentials(account: string): Promise<void> {
    this.checkForKeytar();
    await this.deleteCredentialsHelper(account);
  }

  /**
   * Calls the keytar getPassword service with {@link DefaultCredentialManager#service} and the
   * account passed to the function by Imperative.
   *
   * @param {string} account The account for which to get credentials
   * @param {boolean} optional Set to true if failure to find credentials should be ignored
   *
   * @returns {Promise<SecureCredential>} A promise containing the credentials stored in keytar.
   *
   * @throws {@link ImperativeError} if keytar is not defined.
   * @throws {@link ImperativeError} when keytar.getPassword returns null or undefined.
   */
  protected async loadCredentials(account: string, optional?: boolean): Promise<SecureCredential> {
    this.checkForKeytar();
    // Helper function to handle all breaking changes
    const loadHelper = async (service: string) => {
      let secureValue: string = await this.getCredentialsHelper(service, account);
      // Handle user vs username case // Zowe v1 -> v2 (i.e. @brightside/core@2.x -> @zowe/cli@6+ )
      if (secureValue == null && account.endsWith("_username")) {
        secureValue = await this.keytar.getPassword(service, account.replace("_username", "_user"));
      }
      // Handle pass vs password case // Zowe v0 -> v1 (i.e. @brightside/core@1.x -> @brightside/core@2.x)
      if (secureValue == null && account.endsWith("_pass")) {
        secureValue = await this.keytar.getPassword(service, account.replace("_pass", "_password"));
      }
      return secureValue;
    };

    // load secure properties using the first successful value from our known services
    let secValue = null;
    for (const nextService of this.allServices) {
      secValue = await loadHelper(nextService);
      if (secValue != null) {
          break;
      }
    }

    if (secValue == null && !optional) {
      throw new ImperativeError({
        msg: "Unable to load credentials.",
        additionalDetails: this.getMissingEntryMessage(account)
      });
    }

    if (secValue != null) {
      const impLogger = Logger.getImperativeLogger();
      impLogger.info("Successfully loaded secure value for service = '" + this.service +
        "' account = '" + account + "'");
    }

    return secValue;
  }

  /**
   * Calls the keytar setPassword service with {@link DefaultCredentialManager#service} and the
   * account and credentials passed to the function by Imperative.
   *
   * @param {string} account The account to set credentials
   * @param {SecureCredential} credentials The credentials to store
   *
   * @returns {Promise<void>} A promise that the function has completed.
   *
   * @throws {@link ImperativeError} if keytar is not defined.
   */
  protected async saveCredentials(account: string, credentials: SecureCredential): Promise<void> {
    this.checkForKeytar();
    await this.deleteCredentialsHelper(account, true);
    await this.setCredentialsHelper(this.service, account, credentials);
  }

  /**
   * This function is called before the {@link deletePassword}, {@link getPassword}, and
   * {@link setPassword} functions. It will check if keytar is not null and will throw an error
   * if it is.
   *
   * The error thrown will be the contents of {@link loadError} or a new {@link ImperativeError}.
   * The former error will be the most common one as we expect failures during the load since keytar
   * is optional. The latter error will indicate that some unknown condition has happened so we will
   * create a new ImperativeError with the report suppressed. The report is suppressed because it
   * may be possible that a detailed report could capture a username and password, which would
   * probably be a bad thing.
   *
   * @private
   *
   * @throws {@link ImperativeError} when keytar is null or undefined.
   */
  private checkForKeytar(): void {
      if (this.keytar == null) {
          if (this.loadError == null) {
              throw new ImperativeError({
                  msg: "Keytar was not properly loaded due to an unknown cause."
              }, {
                  suppressReport: true
              });
          } else {
              throw this.loadError;
          }
      }
  }

  /**
   * Helper to load credentials from vault that supports values longer than
   * `DefaultCredentialManager.WIN32_CRED_MAX_STRING_LENGTH` on Windows.
   * @private
   * @param service The string service name.
   * @param account The string account name.
   * @returns A promise for the credential string.
   */
  private async getCredentialsHelper(service: string, account: string): Promise<SecureCredential> {
    // Try to load single-field value from vault
    let value = await this.keytar.getPassword(service, account);

    // If not found, try to load multiple-field value on Windows
    if (value == null && process.platform === "win32") {
      let index = 1;
      // Load multiple fields from vault and concat them
      do {
        const tempValue = await this.keytar.getPassword(service, `${account}-${index}`);
        if (tempValue != null) {
          value = (value || "") + tempValue;
        }
        index++;
        // Loop until we've finished reading null-terminated value
      } while (value != null && !value.endsWith('\0'));
      // Strip off trailing null char
      if (value != null) {
        value = value.replace(/\0$/, "");
      }
    }

    return value;
}

  /**
   * Helper to save credentials to vault that supports values longer than
   * `DefaultCredentialManager.WIN32_CRED_MAX_STRING_LENGTH` on Windows.
   * @private
   * @param service The string service name.
   * @param account The string account name.
   * @param value The string credential.
   */
  private async setCredentialsHelper(service: string, account: string, value: SecureCredential): Promise<void> {
    // On Windows, save value across multiple fields if needed
    if (process.platform === "win32" && value.length > this.WIN32_CRED_MAX_STRING_LENGTH) {
      // First delete any fields previously used to store this value
      await this.keytar.deletePassword(service, account);
      value += '\0';
      let index = 1;
      while (value.length > 0) {
        const tempValue = value.slice(0, this.WIN32_CRED_MAX_STRING_LENGTH);
        await this.keytar.setPassword(service, `${account}-${index}`, tempValue);
        value = value.slice(this.WIN32_CRED_MAX_STRING_LENGTH);
        index++;
      }
    } else {
      // Fall back to simple storage of single-field value
      await this.keytar.setPassword(service, account, value);
    }
  }

  private async deleteCredentialsHelper(account: string, keepCurrentSvc?: boolean): Promise<boolean> {
    let wasDeleted = false;
    for (const service of this.allServices) {
      if (keepCurrentSvc && service === DefaultCredentialManager.SVC_NAME) {
        continue;
      }
      if (await this.keytar.deletePassword(service, account)) {
        wasDeleted = true;
      }
    }
    if (process.platform === "win32") {
      // Handle deletion of long values stored across multiple fields
      let index = 1;
      while (await this.keytar.deletePassword(DefaultCredentialManager.SVC_NAME, `${account}-${index}`)) {
        index++;
      }
      if (index > 1) {
        wasDeleted = true;
      }
  }
    return wasDeleted;
  }

  private getMissingEntryMessage(account: string) {
    let listOfServices = `  Service = `;
    for (const service of this.allServices) {
      listOfServices += `${service}, `;
    }
    const commaAndSpace = 2;
    listOfServices = listOfServices.slice(0, -1 * commaAndSpace) + `\n  Account = ${account}\n\n`;

    return "Could not find an entry in the credential vault for the following:\n" +
        listOfServices +
        "Possible Causes:\n" +
        "  This could have been caused by any manual removal of credentials from your vault.\n\n" +
        "Resolutions: \n" +
        "  Recreate the credentials in the vault for the particular service in the vault.\n";
  }
};
