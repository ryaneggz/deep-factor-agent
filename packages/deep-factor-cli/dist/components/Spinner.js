import { jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Text } from "ink";
export function Spinner() {
    const [dotCount, setDotCount] = useState(1);
    useEffect(() => {
        const interval = setInterval(() => {
            setDotCount((prev) => (prev % 3) + 1);
        }, 300);
        return () => clearInterval(interval);
    }, []);
    return _jsxs(Text, { color: "yellow", children: ["Thinking", ".".repeat(dotCount)] });
}
