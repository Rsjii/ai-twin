export declare class BackgroundLearningService {
    shouldUpdateTwin(twinId: string): Promise<boolean>;
    processTwinLearning(twinId: string, userId: string): Promise<boolean>;
    private applyLearningCorrections;
    processAllTwins(): Promise<void>;
}
export declare const backgroundLearningService: BackgroundLearningService;
//# sourceMappingURL=backgroundLearning.d.ts.map