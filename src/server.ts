import app from './app';
import { expirePendingQuotes } from './services/quote-cleanup.service';

const PORT = process.env.PORT || 4000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const runExpiry = () =>
  expirePendingQuotes()
    .then((count) => count && console.log(`🧹 Expired ${count} quote(s)`))
    .catch((error) => console.error('Quote expiry failed:', error));

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

runExpiry();
setInterval(runExpiry, ONE_HOUR_MS).unref();
