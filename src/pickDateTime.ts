import { Platform } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";

/** Android: pick a date, then a time. Resolves null if cancelled. */
export function pickDateTime(initial = new Date(), { dateOnly = false } = {}): Promise<Date | null> {
  if (Platform.OS !== "android") return Promise.resolve(initial);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value: initial,
      mode: "date",
      onChange: (e, date) => {
        if (e.type !== "set" || !date) return resolve(null);
        if (dateOnly) return resolve(date);
        DateTimePickerAndroid.open({
          value: date,
          mode: "time",
          onChange: (e2, time) => {
            if (e2.type !== "set" || !time) return resolve(null);
            const d = new Date(date);
            d.setHours(time.getHours(), time.getMinutes(), 0, 0);
            resolve(d);
          },
        });
      },
    });
  });
}
