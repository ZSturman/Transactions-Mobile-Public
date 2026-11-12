import { ScrollView, View } from "react-native";
import Button from "./Button";
export default function Choices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (T | { value: T; label: string })[];
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <Button
              key={item.value}
              title={item.label}
              small
              variant={item.value === value ? "primary" : "secondary"}
              onPress={() => onChange(item.value)}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}
