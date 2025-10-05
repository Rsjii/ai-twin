export declare const db: {
    query: (text: string, params?: any[]) => Promise<import("pg").QueryResult<any>>;
    getClient: () => Promise<import("pg").PoolClient>;
    close: () => Promise<void>;
};
export default db;
//# sourceMappingURL=db.d.ts.map