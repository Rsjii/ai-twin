export declare class SystemPromptUpdater {
    private twinService;
    constructor();
    updateTwinSystemPrompt(twinId: string): Promise<boolean>;
    private generateEnhancedSystemPrompt;
    private generateFallbackPrompt;
    updateAllTwins(): Promise<void>;
}
export declare const systemPromptUpdater: SystemPromptUpdater;
//# sourceMappingURL=systemPromptUpdater.d.ts.map