interface SettingsPaneProps {
    model: string;
    enableBash: boolean;
    maxIter: number;
    onModelChange: (model: string) => void;
    onBashToggle: () => void;
}
export declare function SettingsPane({ model, enableBash, maxIter, onModelChange, onBashToggle, }: SettingsPaneProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SettingsPane.d.ts.map