import { type User, type InsertUser } from "@shared/schema";
import { randomUUID } from "crypto";
import { PostgresStateStore } from "@credverse/shared-auth";

// modify the interface with any CRUD methods
// you might need

export interface VerificationRecord {
  id: string;
  credentialType: string;
  issuer: string;
  subject: string;
  status: string;
  riskScore: number;
  fraudScore: number;
  recommendation: string;
  timestamp: Date;
  verifiedBy: string;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Verification methods
  addVerification(record: VerificationRecord): Promise<void>;
  getVerifications(filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<VerificationRecord[]>;
  getVerification(id: string): Promise<VerificationRecord | undefined>;
}

interface RecruiterStorageState {
  users: Array<[string, User]>;
  verifications: VerificationRecord[];
}

function parseDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private verifications: VerificationRecord[];

  constructor() {
    this.users = new Map();
    this.verifications = [];
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async addVerification(record: VerificationRecord): Promise<void> {
    this.verifications.unshift(record);
    if (this.verifications.length > 1000) {
      this.verifications.pop();
    }
  }

  async getVerifications(filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<VerificationRecord[]> {
    let results = [...this.verifications];

    if (filters?.status) {
      results = results.filter(r => r.status === filters.status);
    }
    if (filters?.startDate) {
      results = results.filter(r => r.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter(r => r.timestamp <= filters.endDate!);
    }

    return results;
  }

  async getVerification(id: string): Promise<VerificationRecord | undefined> {
    return this.verifications.find(r => r.id === id);
  }

  exportState(): RecruiterStorageState {
    return {
      users: Array.from(this.users.entries()),
      verifications: [...this.verifications],
    };
  }

  importState(state: RecruiterStorageState): void {
    this.users = new Map((state.users || []).map(([key, value]) => [key, {
      ...value,
      createdAt: parseDate((value as any).createdAt),
    }]));
    this.verifications = (state.verifications || []).map((row) => ({
      ...row,
      timestamp: parseDate((row as any).timestamp),
    }));
  }
}

const requirePersistentStorage =
  process.env.NODE_ENV === "production" || process.env.REQUIRE_DATABASE === "true";
const databaseUrl = process.env.DATABASE_URL;

if (requirePersistentStorage && !databaseUrl) {
  throw new Error(
    "[Storage] REQUIRE_DATABASE policy is enabled but DATABASE_URL is missing."
  );
}

function createPersistedStorage(base: MemStorage, dbUrl?: string): MemStorage {
  if (!dbUrl) {
    return base;
  }

  const stateStore = new PostgresStateStore<RecruiterStorageState>({
    databaseUrl: dbUrl,
    serviceKey: "recruiter-storage",
  });

  let hydrated = false;
  let hydrationPromise: Promise<void> | null = null;
  let persistChain = Promise.resolve();
  const mutatingPrefixes = ["create", "add", "update", "delete", "revoke", "bulk"];

  const ensureHydrated = async () => {
    if (hydrated) return;
    if (!hydrationPromise) {
      hydrationPromise = (async () => {
        const loaded = await stateStore.load();
        if (loaded) {
          base.importState(loaded);
        } else {
          await stateStore.save(base.exportState());
        }
        hydrated = true;
      })();
    }
    await hydrationPromise;
  };

  const queuePersist = async () => {
    persistChain = persistChain
      .then(async () => {
        await stateStore.save(base.exportState());
      })
      .catch((error) => {
        console.error("[Storage] Failed to persist recruiter state:", error);
      });
    await persistChain;
  };

  return new Proxy(base, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      return async (...args: unknown[]) => {
        await ensureHydrated();
        const result = await value.apply(target, args);
        const shouldPersist = mutatingPrefixes.some(
          (prefix) => typeof prop === "string" && prop.startsWith(prefix),
        );
        if (shouldPersist) {
          await queuePersist();
        }
        return result;
      };
    },
  }) as MemStorage;
}

export const storage = createPersistedStorage(new MemStorage(), databaseUrl);
