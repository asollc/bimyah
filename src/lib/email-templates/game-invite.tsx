import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface GameInviteProps {
  inviterName?: string;
  recipientName?: string;
  joinUrl?: string;
  gameCode?: string;
}

const GameInviteEmail = ({
  inviterName = "A friend",
  recipientName,
  joinUrl = "https://playbimyah.com",
  gameCode,
}: GameInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{inviterName} invites you to play Bimyah!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {recipientName ? `Hey ${recipientName},` : "You've been invited!"}
        </Heading>
        <Text style={text}>
          <strong>{inviterName}</strong> invites you to play Bimyah!
        </Text>
        {gameCode ? (
          <Text style={codeText}>
            Room code: <span style={codeMono}>{gameCode}</span>
          </Text>
        ) : null}
        <Section style={{ textAlign: "center", margin: "28px 0" }}>
          <Button style={button} href={joinUrl}>
            Join the match
          </Button>
        </Section>
        <Text style={smallText}>
          Or open this link directly:{" "}
          <a href={joinUrl} style={link}>
            {joinUrl}
          </a>
        </Text>
        <Text style={footer}>See you at the table — Bimyah!</Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: GameInviteEmail,
  subject: (data: Record<string, any>) =>
    `${data?.inviterName ?? "A friend"} invites ${
      data?.recipientName ?? "you"
    } to play Bimyah!`,
  displayName: "Game invite",
  previewData: {
    inviterName: "Aisha",
    recipientName: "Omar",
    joinUrl: "https://playbimyah.com/join/1234",
    gameCode: "1234",
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, sans-serif" };
const container = { padding: "24px 28px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#0d1b2a", margin: "0 0 16px" };
const text = { fontSize: "15px", color: "#2d2d2d", lineHeight: "1.5", margin: "0 0 12px" };
const codeText = { fontSize: "14px", color: "#55575d", margin: "8px 0 0" };
const codeMono = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "18px",
  letterSpacing: "0.3em",
  color: "#0d7a5f",
  fontWeight: "bold" as const,
};
const button = {
  backgroundColor: "#0d7a5f",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: "bold" as const,
  textDecoration: "none",
  fontSize: "15px",
};
const smallText = { fontSize: "12px", color: "#55575d", lineHeight: "1.5", margin: "16px 0 0" };
const link = { color: "#0d7a5f", textDecoration: "underline" };
const footer = { fontSize: "12px", color: "#999999", margin: "28px 0 0" };
