import { z, ZodSchema } from "zod";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import yaml from 'js-yaml';
import fs from 'fs/promises';

export class boxConfigManager {
    // 1. Private static instance variable to hold the single instance
    private static _instance: boxConfigManager;

    public argv: any;
    public config: any;

    // 2. Private constructor to prevent direct instantiation
    private constructor(argv: any, config: any) {
        Object.assign(this, { ...config, argv });
    }

    /**
     * Public static method to get the single instance of boxConfigManager.
     * It performs the configuration loading and validation only once.
     * @param zodSchema Optional Zod schema for configuration validation.
     * @returns A promise that resolves to the single, fully initialized boxConfigManager instance. 
     * If an existing instance has already been spawned for the application due to a prior construction, then *that* instance will be returned.
     */
    public static async getInstance(zodSchema: ZodSchema | undefined = undefined): Promise<boxConfigManager> {

        if (process.argv.includes('--buildOnly')) {
            console.log('Build completed.');
            process.exit();
        }

        // If an instance doesn't exist, create and initialize it
        if (!boxConfigManager._instance) {
            // 1. Parse command-line arguments to get the config file path.
            const argv = await yargs(hideBin(process.argv))
                .option('configFile', {
                    alias: 'c',
                    type: 'string',
                    description: 'Path to the config file',
                    demandOption: true,
                })
                .help()
                .argv;

            const configFilePath = argv.configFile as string;

            let maybeConfig: unknown;
            try {
                // 2. Read the content of the config file.
                const configFileContent = await fs.readFile(configFilePath, 'utf-8');
                // 3. Parse the YAML content.
                maybeConfig = yaml.load(configFileContent);
            } catch (error: any) {
                throw new Error(`Failed to load or parse configuration file: ${configFilePath}. Details: \n${error.message}`);
            }

            let validatedConfig: unknown = maybeConfig;
            if (zodSchema) {
                try {
                    // 4. Validate the parsed configuration against the provided Zod schema.
                    validatedConfig = zodSchema.parse(maybeConfig);
                } catch (e: any) {
                    if (e instanceof z.ZodError) {
                        const errorMessages = e.errors.map((err: any) => `\n- ${err.path.join('.')} : ${err.message}`).join(", ");
                        throw new Error(`Configuration validation failed. Check your YAML file for the following errors: ${errorMessages}`);
                    } else {
                        throw new Error(`Unexpected validation error: ${e.message}`);
                    }
                }
            }
            
            // 5. Create the single instance and store it
            boxConfigManager._instance = new boxConfigManager(argv, validatedConfig);

            const isDev = configFilePath.includes('dev');
            const color = isDev ? '\x1b[33m' : '\x1b[38;5;208m'; // Yellow for dev, Orange for prod
            const envEmoji = isDev ? '🛠️' : '🚀';
            console.log(`${color}${envEmoji} boxConfig loaded: ${configFilePath}\x1b[0m`);
        }
        // Always return the stored instance
        return boxConfigManager._instance;
    }
}