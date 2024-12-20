import watchman from 'fb-watchman';
import path from 'path';
import RPC from 'discord-rpc';

const client_id = "934221567242690561";
const directoryToWatch = "E:\\! DRAWINGS"; // Directory where .clip files are stored
let activeFile = null;
let isInitialized = false; // Flag to track if the initial state is processed

// Initialize Discord RPC client
const client = new RPC.Client({ transport: "ipc" });
RPC.register(client_id);

/**
 * Set Discord Rich Presence activity
 * @param {string|null} filePath - Path to the active file, or null for default activity
 */
async function setActivity(filePath = null) {
    const details = filePath
        ? `🖊️ Editing ${path.basename(filePath)}`
        : "Choosing a project...";

    try {
        await client.setActivity({
            details,
            startTimestamp: Date.now(),
            largeImageKey: "large_logo",
            instance: true,
        });
        console.log(`Updated activity: ${details}`);
    } catch (err) {
        console.error("Failed to update activity:", err.message);
    }
}

// Initialize Watchman client
const watchmanClient = new watchman.Client();

/**
 * Start monitoring the directory with Watchman
 */
function startWatching() {
    watchmanClient.capabilityCheck({ required: ['relative_root'] }, (err, resp) => {
        if (err) {
            console.error("Watchman capability check failed:", err);
            process.exit(1);
        }

        watchmanClient.command(['watch-project', directoryToWatch], (err, resp) => {
            if (err) {
                console.error("Failed to start watching directory:", err);
                process.exit(1);
            }

            const { watch, relative_path: relativeRoot } = resp;
            console.log(`Watchman is watching: ${watch}`);

            // Subscribe to changes in the directory
            watchmanClient.command(['subscribe', watch, 'cspSubscription', {
                expression: ['suffix', 'clip'], // Watch only `.clip` files
                fields: ['name', 'exists', 'type'],
                relative_root: relativeRoot,
            }], (err) => {
                if (err) {
                    console.error("Failed to subscribe to directory changes:", err);
                    process.exit(1);
                }
                console.log("Subscription established.");
            });
        });
    });

    // Handle subscription updates
    watchmanClient.on('subscription', (resp) => {
        if (resp.subscription !== 'cspSubscription') return;

        for (const file of resp.files) {
            if (file.exists && file.type === 'f') {
                if (!isInitialized) {
                    // Skip files reported during the initial state
                    // console.log(`Skipping initial file: ${file.name}`);
                    continue;
                }

                // Update activity with the most recent file
                activeFile = path.join(directoryToWatch, file.name);
                setActivity(activeFile);
            }
        }

        // Mark the watcher as initialized after processing the first batch
        isInitialized = true;
    });
}

// Initialize Discord RPC
client.on('ready', () => {
    console.log("Discord RPC is ready.");
    setActivity(); // Set default activity
    startWatching(); // Start Watchman file monitoring
});

// Log in to Discord RPC
client.login({ clientId: client_id }).catch(console.error);

// Handle errors
process.on('uncaughtException', (err) => {
    console.error("Uncaught Exception:", err);
});
process.on('unhandledRejection', (reason) => {
    console.error("Unhandled Rejection:", reason);
});
