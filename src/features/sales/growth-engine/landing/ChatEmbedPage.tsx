// /quote/chat: the AI quote assistant on its own, for an <iframe> on the corporate website, e.g.
//   <iframe src="https://<this site>/quote/chat" style="width:380px;height:620px;border:0" title="Quote assistant"></iframe>
// The API must list the site's origin in CORS only if the widget is built into that site directly; inside the iframe
// it runs on this site's origin.
import { WebAiIntakeWidget } from "@/shared/ads/WebAiIntakeWidget";
import "@/shared/ads/ads.css";

export function ChatEmbedPage() {
  return (
    <div className="adw-embed-page">
      <WebAiIntakeWidget mode="embedded" />
    </div>
  );
}
