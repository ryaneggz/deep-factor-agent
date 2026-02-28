export interface SideBarItem<V> {
    label: string;
    value: V;
}
interface SideBarProps<V> {
    items: Array<SideBarItem<V>>;
    onSelect: (item: SideBarItem<V>) => void;
}
export declare function SideBar<V>({ items, onSelect }: SideBarProps<V>): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SideBar.d.ts.map