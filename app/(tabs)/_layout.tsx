import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/auth";
import { C } from "../../src/theme";
import { useNewLeadsCount } from "../../src/newLeads";

export default function TabsLayout() {
  const { user } = useAuth();
  const coordinator = user?.role === "exam_coordinator";
  const { count: newLeads } = useNewLeadsCount(!coordinator);
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.navy },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.faint,
        tabBarLabelStyle: { fontWeight: "700", fontSize: 11 },
        sceneStyle: { backgroundColor: C.page },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Today", tabBarIcon: ({ color, size }) => <Ionicons name="sunny-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="leads" options={{ title: coordinator ? "Students" : "My leads", tabBarBadge: newLeads > 0 ? (newLeads > 99 ? "99+" : newLeads) : undefined, tabBarBadgeStyle: { backgroundColor: C.red }, tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color} size={size} /> }} />
      <Tabs.Screen
        name="follow-ups"
        options={{ title: "Follow-ups", href: coordinator ? null : undefined, tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
