const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

console.log('=== CEK CONFIG ===');
console.log('TOKEN ada?', !!TELEGRAM_TOKEN);
console.log('CHAT_ID ada?', !!TELEGRAM_CHAT_ID, '| nilai:', TELEGRAM_CHAT_ID);
console.log('==================');

async function test() {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('❌ SECRETS TIDAK DITEMUKAN! Set TELEGRAM_TOKEN dan TELEGRAM_CHAT_ID di GitHub Secrets.');
        process.exit(1);
    }

    console.log('Mengirim pesan test ke Telegram...');
    try {
        const res = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: '✅ <b>TEST BERHASIL!</b>\nBot loker Padang aktif dan bisa kirim pesan ke kamu.',
            parse_mode: 'HTML'
        });
        console.log('✅ SUKSES! Cek Telegram kamu sekarang!');
    } catch (err) {
        const data = err.response ? err.response.data : err.message;
        console.error('❌ GAGAL:', JSON.stringify(data));
        process.exit(1);
    }
}

test();
