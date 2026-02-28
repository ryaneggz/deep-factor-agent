import { tool } from "@langchain/core/tools";
export function createLangChainTool(name, config) {
    return tool(async (args) => {
        const result = await config.execute(args);
        return typeof result === "string" ? result : JSON.stringify(result);
    }, {
        name,
        description: config.description,
        schema: config.schema,
    });
}
export function toolArrayToMap(tools) {
    const map = {};
    for (const t of tools) {
        map[t.name] = t;
    }
    return map;
}
export function findToolByName(tools, name) {
    return tools.find((t) => t.name === name);
}
