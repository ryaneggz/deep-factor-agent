import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";
export function SideBar({ items, onSelect }) {
    return (_jsxs(Box, { flexDirection: "column", width: 30, borderStyle: "single", paddingX: 1, paddingY: 1, height: "100%", children: [_jsx(Text, { bold: true, children: "Deep Factor" }), _jsx(Box, { marginTop: 1, children: _jsx(SelectInput, { items: items, onSelect: onSelect }) })] }));
}
