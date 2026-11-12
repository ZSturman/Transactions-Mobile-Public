import { createNativeStackNavigator } from "@react-navigation/native-stack";
import PairsListScreen from "../screens/PairsListScreen";
import PairDetailScreen from "../screens/PairDetailScreen";
import AddTransactionScreen from "../screens/AddTransactionScreen";
import { MainStackParamList } from "./types";
import SettingsScreen from "../screens/SettingsScreen";
import ChooseContactScreen from "../screens/ChooseContactScreen";
import CsvImportScreen from "../screens/CsvImportScreen";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Pairs"
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <Stack.Screen
        name="ChooseContact"
        component={ChooseContactScreen}
        options={{ title: "New transaction" }}
      />
      <Stack.Screen
        name="CsvImport"
        component={CsvImportScreen}
        options={{ title: "Import CSV" }}
      />
      <Stack.Screen
        name="Pairs"
        component={PairsListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PairDetail"
        component={PairDetailScreen}
        options={{ title: "Contact" }}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={{ title: "Add transaction", presentation: "modal" }}
      />
    </Stack.Navigator>
  );
}
