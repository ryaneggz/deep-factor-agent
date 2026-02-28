import React from "react";
import { Box, Text } from "ink";
import SelectInput from "ink-select-input";

export interface SideBarItem<V> {
  label: string;
  value: V;
}

interface SideBarProps<V> {
  items: Array<SideBarItem<V>>;
  onSelect: (item: SideBarItem<V>) => void;
}

export function SideBar<V>({ items, onSelect }: SideBarProps<V>) {
  return (
    <Box
      flexDirection="column"
      width={30}
      borderStyle="single"
      paddingX={1}
      paddingY={1}
      height="100%"
    >
      <Text bold>Deep Factor</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={onSelect} />
      </Box>
    </Box>
  );
}
