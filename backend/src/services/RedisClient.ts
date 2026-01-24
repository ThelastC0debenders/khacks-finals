import { createClient, RedisClientType } from 'redis';

export class RedisClient {
    private static instance: RedisClientType | null = null;
    private static isConnecting = false;

    static async connect(): Promise<RedisClientType> {
        if (this.instance) {
            return this.instance;
        }

        if (this.isConnecting) {
            // Wait for existing connection attempt
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.connect();
        }

        this.isConnecting = true;

        try {
            const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
            console.log('[Redis] Connecting to:', redisUrl);

            const client = createClient({ url: redisUrl });

            client.on('error', (err) => {
                console.error('[Redis] Connection error:', err.message);
            });

            client.on('connect', () => {
                console.log('[Redis] Connected successfully');
            });

            await client.connect();
            this.instance = client as RedisClientType;
            return this.instance;
        } catch (error: any) {
            console.error('[Redis] Failed to connect:', error.message);
            throw error;
        } finally {
            this.isConnecting = false;
        }
    }

    static async disconnect(): Promise<void> {
        if (this.instance) {
            await this.instance.disconnect();
            this.instance = null;
            console.log('[Redis] Disconnected');
        }
    }

    static async isConnected(): Promise<boolean> {
        if (!this.instance) return false;
        try {
            await this.instance.ping();
            return true;
        } catch {
            return false;
        }
    }
}