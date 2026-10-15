import { Body, Container, Head, Heading, Html, Preview, Text } from "@react-email/components";
import type { TemplateEntry } from "./registry";

const WhitelistEmail = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Whitelist Bimyah! so you don't miss invites</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Whitelist Bimyah!</Heading>
        <Text style={text}>
          Here's that email I told you I was sending. If it did end up in your spam folder,
          simply whitelist/star/add to contacts, and mark it as NOT SPAM, so that your game
          notifications like invites from friends don't continue going to spam.
        </Text>
        <Text style={text}>
          If the email actually landed in your regular inbox, you'll still want to
          whitelist/star/add to contacts, to make sure it doesn't randomly start going to spam.
        </Text>
        <Text style={text}>
          I'll be adding push notifications once the app is added to the app stores, but I still
          have some work to do before that happens. So thanks for your patience while I try to
          make the game as fun as possible.
        </Text>
        <Text style={signoff}>-Ronya</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: WhitelistEmail,
  subject: "Whitelist Bimyah!",
  displayName: "Whitelist Bimyah!",
  previewData: {},
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#0d1b2a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#2d2d2d", lineHeight: "1.6", margin: "0 0 14px" };
const signoff = { fontSize: "15px", color: "#0d7a5f", fontWeight: "bold" as const, margin: "20px 0 0" };
