// Saved WhatsApp / email messages for leads (same as the website)
export const PLACEHOLDERS = ["{name}", "{first_name}", "{course}", "{my_name}", "{my_phone}"];

export const STARTERS: Record<string, string> = {
  whatsapp: "Hi {first_name}, this is {my_name} from CERTEZY. Thanks for your interest in {course}. When is a good time to talk?",
  email: "Hi {first_name},\n\nThanks for your interest in {course}. I'd be glad to help you plan your preparation.\n\nBest regards,\n{my_name}\nCERTEZY E-LEARNING PVT LTD",
};

export const fillTemplate = (text: string, lead: any, me: any) =>
  String(text ?? "")
    .split("{name}").join(lead?.name ?? "")
    .split("{first_name}").join(String(lead?.name ?? "").split(" ")[0])
    .split("{course}").join(lead?.course_title ?? "our course")
    .split("{my_name}").join(me?.name ?? "")
    .split("{my_phone}").join(me?.mobile ?? "");

/** WhatsApp goes to the consultant-added number, else the lead's phone. */
export const whatsappNumberOf = (lead: any) => String(lead?.whatsapp_number || lead?.phone || "").replace(/\D/g, "");
