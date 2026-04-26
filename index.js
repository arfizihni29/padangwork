const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Debug: cek apakah secrets terbaca
console.log('=== TELEGRAM CONFIG CHECK ===');
console.log('TELEGRAM_TOKEN ada?', !!TELEGRAM_TOKEN);
console.log('TELEGRAM_CHAT_ID ada?', !!TELEGRAM_CHAT_ID, '| nilai:', TELEGRAM_CHAT_ID);
console.log('=============================');

const URLS = [
    'https://glints.com/id/opportunities/jobs/explore?keyword=admin&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?keyword=marketing&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat?tags=new',
    'https://id.jobstreet.com/id/Admin-jobs/in-Sumatera-Barat?tags=new',
    'https://pintarnya.com/l-kota-padang-lowongan?sort=-published_at&search=&city_id=69&province_id=-1',
    'https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=3c420344-8d9d-48a5-80e9-80e8a1617acd&locationName=Solok%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://www.kitalulus.com/lowongan?sortBy=isHighlighted&location=Kota+Padang&gender=F',
    'https://glints.com/id/opportunities/jobs/explore?keyword=Admin&country=ID&locationId=16cbbddf-c3fe-4ca5-a8ff-08ae52c9f085&locationName=Sumatera+Barat&lowestLocationLevel=2&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?keyword=Admin&country=ID&locationId=f34ea55b-a896-4156-8477-5db45491bac6&locationName=Jambi&lowestLocationLevel=2&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?keyword=Admin&country=ID&locationId=5738028d-c59b-402e-93ba-a289e2ddb27f&locationName=Payakumbuh%2C+Sumatera+Barat&lowestLocationLevel=3',
    'https://id.jobstreet.com/id/Admin-jobs/in-Padang-Sumatera-Barat?sortmode=ListedDate&tags=new',
    'https://glints.com/id/opportunities/jobs/explore?keyword=RESEARCH+AND+DEVELOPMENT&country=ID&locationId=16cbbddf-c3fe-4ca5-a8ff-08ae52c9f085&locationName=Sumatera+Barat&lowestLocationLevel=2&sortBy=LATEST'
];

async function sendTelegram(message) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("❌ Telegram Token atau Chat ID TIDAK ADA di environment. Cek GitHub Secrets!");
        return;
    }
    
    try {
        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('✅ Telegram terkirim! Response OK:', response.data.ok);
    } catch (error) {
        const errData = error.response ? error.response.data : error.message;
        console.error('❌ GAGAL kirim Telegram:', JSON.stringify(errData));
    }
}

function cleanUrl(url) {
    try {
        const u = new URL(url);
        u.search = '';
        u.hash = '';
        return u.toString();
    } catch (e) {
        return url;
    }
}

async function scrape() {
    const isCI = !!process.env.GITHUB_ACTIONS;
    console.log('Berjalan di GitHub Actions?', isCI);

    const browser = await puppeteer.launch({ 
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1280,900'
        ],
        headless: true,
        ignoreHTTPSErrors: true
    });

    let allJobs = [];

    for (let url of URLS) {
        console.log(`Scraping: ${url}`);
        let retries = 2;
        while (retries >= 0) {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1280, height: 900 });
            // Block images/fonts to speed up scraping
            await page.setRequestInterception(true);
            page.on('request', req => {
                if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
                else req.continue();
            });

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
                
                // Tunggu lebih lama di GitHub Actions karena server cloud lebih lambat
                const isGlints = url.includes('glints.com');
                const isKitaLulus = url.includes('kitalulus.com');
                const baseDelay = isCI ? 6000 : 3000;
                if (isGlints || isKitaLulus) {
                    await new Promise(r => setTimeout(r, baseDelay + 2000));
                } else {
                    await new Promise(r => setTimeout(r, baseDelay));
                }

                // Scroll down to trigger lazy-loading of job cards
                await page.evaluate(async () => {
                    await new Promise(resolve => {
                        let totalHeight = 0;
                        const distance = 400;
                        const timer = setInterval(() => {
                            window.scrollBy(0, distance);
                            totalHeight += distance;
                            if (totalHeight >= 5000) {
                                clearInterval(timer);
                                resolve();
                            }
                        }, 150);
                    });
                });
                await new Promise(r => setTimeout(r, 1500));

                const jobs = await page.evaluate((currentUrl) => {
                    const isGlints = currentUrl.includes('glints.com');
                    const isPintarnya = currentUrl.includes('pintarnya.com');
                    const isKitaLulus = currentUrl.includes('kitalulus.com');
                    let results = [];
                    const links = document.querySelectorAll('a');

                    for (let a of links) {
                        const text = a.innerText.trim();
                        const href = a.href;
                        if (!href || !text) continue;

                        // Get context card text
                        let rawContainerText = '';
                        if (isGlints) {
                            // Try multiple selector strategies for Glints
                            let card = a.closest('[class*="JobCard"]') 
                                    || a.closest('[class*="job-card"]')
                                    || a.closest('[class*="Card"]')
                                    || a.closest('li')
                                    || a.closest('article');
                            if (card) rawContainerText = card.innerText;
                        } else if (isPintarnya) {
                            let card = a.closest('[class*="card"]') 
                                    || a.closest('[class*="job"]')
                                    || a.closest('li')
                                    || (a.parentElement && a.parentElement.parentElement);
                            if (card) rawContainerText = card.innerText;
                        } else if (isKitaLulus) {
                            let card = a.closest('[class*="card"]')
                                    || a.closest('[class*="job"]')
                                    || a.closest('li')
                                    || a.closest('article');
                            if (card) rawContainerText = card.innerText;
                            else rawContainerText = a.innerText;
                        } else {
                            // JobStreet
                            let article = a.closest('article') || a.closest('[data-id]') || a.closest('li');
                            if (article) rawContainerText = article.innerText;
                        }

                        if (!rawContainerText) {
                            rawContainerText = (a.parentElement && a.parentElement.parentElement) 
                                ? a.parentElement.parentElement.innerText
                                : '';
                        }

                        let containerText = rawContainerText.toLowerCase();

                        // Freshness filter: max 4 days old (more precise)
                        let isFresh = true;
                        if (containerText) {
                            // Definitely old: months/years old
                            if (containerText.match(/\d+\s*(bulan|month|tahun|year)/) ||
                                containerText.includes('30+ hari') || containerText.includes('30+d')) {
                                isFresh = false;
                            }
                            // Check "X minggu" / "X week" — only skip if >= 1 week
                            else if (containerText.match(/[1-9]\d*\s*(minggu|week)/)) {
                                isFresh = false;
                            }
                            // Check "X hari" / "X day" — skip if > 4
                            else {
                                let match = containerText.match(/(\d+)\s*(hari|day|d\s+ago|d ago)/);
                                if (match && parseInt(match[1]) > 4) {
                                    isFresh = false;
                                }
                            }
                        }
                        if (!isFresh) continue;
                        
                        // Filter out unwanted jobs
                        const title = text.split('\n')[0].toLowerCase();
                        if (
                            title.includes('sales') ||
                            title.includes('penagihan') ||
                            title.includes('field collection') ||
                            title.includes('office boy') ||
                            title.includes('cleaning service') ||
                            title.includes('kolektor') ||
                            title.includes('collector') ||
                            title.includes('driver') ||
                            title.includes('supir')
                        ) continue;
                        
                        // Filter out jobs strictly for males (check title first, then card)
                        const checkText = (title + ' ' + containerText);
                        if ((checkText.includes('pria') || checkText.includes('laki-laki') || checkText.includes('laki laki') || checkText.includes('cowok'))) {
                            if (!checkText.includes('wanita') && !checkText.includes('perempuan') && !checkText.includes('cewek')) {
                                continue;
                            }
                        }

                        // Extract salary
                        let salary = 'Gaji tidak ditampilkan';
                        if (rawContainerText) {
                            const lines = rawContainerText.split(/\n|\|/);
                            const salLine = lines.find(l => /rp[\s\d]|idr[\s\d]/i.test(l));
                            if (salLine) salary = salLine.trim().substring(0, 60);
                        }
                        
                        if (isGlints) {
                            if (href.includes('/opportunities/jobs/') && !href.includes('/explore')) {
                                results.push({ title: text.split('\n')[0].trim(), link: href, salary });
                            }
                        } else if (isPintarnya) {
                            if (href.includes('/lowongan/')) {
                                results.push({ title: text.split('\n')[0].trim(), link: href, salary });
                            }
                        } else if (isKitaLulus) {
                            if (href.includes('/lowongan/')) {
                                results.push({ title: text.split('\n')[0].trim(), link: href, salary });
                            }
                        } else {
                            // JobStreet
                            if (href.includes('/job/')) {
                                results.push({ title: text.split('\n')[0].trim(), link: href, salary });
                            }
                        }
                    }
                    return results;
                }, url);
                
                console.log(`  → ${jobs.length} loker ditemukan dari ${url}`);
                allJobs = allJobs.concat(jobs);
                await page.close();
                break; // success, exit retry loop
            } catch (e) {
                console.error(`Error scraping ${url} (sisa retry: ${retries}):`, e.message);
                await page.close();
                retries--;
                if (retries >= 0) {
                    console.log(`  → Mencoba ulang...`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
        }
    }

    await browser.close();

    const uniqueJobsMap = new Map();
    for (let job of allJobs) {
        const cUrl = cleanUrl(job.link);
        job.cleanLink = cUrl;
        
        if (!job.title || job.title.length < 4 || job.title.toLowerCase() === 'simpan' || job.title.toLowerCase() === 'save') {
            continue;
        }

        if (uniqueJobsMap.has(cUrl)) {
            const existing = uniqueJobsMap.get(cUrl);
            if (job.title.length > existing.title.length) {
                uniqueJobsMap.set(cUrl, job);
            }
        } else {
            uniqueJobsMap.set(cUrl, job);
        }
    }
    
    const uniqueJobs = Array.from(uniqueJobsMap.values());
    console.log(`Total unique jobs found: ${uniqueJobs.length}`);

    let sentJobs = [];
    if (fs.existsSync('sent_jobs.json')) {
        try {
            sentJobs = JSON.parse(fs.readFileSync('sent_jobs.json', 'utf-8'));
        } catch(e) {
            console.error("Error reading sent_jobs.json", e);
        }
    }

    const newJobs = uniqueJobs.filter(j => !sentJobs.includes(j.cleanLink));
    console.log(`New jobs to send: ${newJobs.length}`);

    if (newJobs.length > 0) {
        const quotes = [
            "SEMANGAT TERUS PEJUANG RUPIAH!",
            "REZEKI NGGAK AKAN KETUKAR, GAS APPLY!",
            "HARI BARU, PELUANG BARU. YUK BISA!",
            "JANGAN MENYERAH, KESUKSESAN ADA DI DEPAN MATA!",
            "TETAP SEMANGAT, USAHA TIDAK AKAN MENGKHIANATI HASIL!",
            "YUK APPLY SEKARANG, SIAPA TAHU INI REZEKI KAMU!",
            "BISMILLAH, SEMOGA HARI INI BAWA KABAR BAIK!"
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

        let message = `🚀 <b>${randomQuote}</b> 🚀\n\nBerikut loker terbaru (super fresh) untuk area Padang, Solok, Jambi, Payakumbuh & Sumbar:\n\n`;
        let count = 0;
        
        for (let i = 0; i < newJobs.length; i++) {
            const job = newJobs[i];
            const safeTitle = job.title.replace(/[<>]/g, ''); // hindari tag HTML salah
            message += `🏢 <b>${i+1}. ${safeTitle}</b>\n💰 ${job.salary || 'Gaji tidak ditampilkan'}\n🔗 ${job.cleanLink}\n\n`;
            count++;
            
            // Telegram limit batch size to avoid overly long messages, bumped to 40 per bubble to keep it in one chat bubble mostly
            if (count % 40 === 0 || i === newJobs.length - 1) {
                message += `\n🤖 <i>This bot was Created by Arfi</i>\n`;
                await sendTelegram(message);
                
                const nextQuote = quotes[Math.floor(Math.random() * quotes.length)];
                message = `🚀 <b>${nextQuote} (LANJUTAN)</b> 🚀\n\n`;
            }
        }
        
        newJobs.forEach(j => sentJobs.push(j.cleanLink));
        fs.writeFileSync('sent_jobs.json', JSON.stringify(sentJobs, null, 2));
        console.log("sent_jobs.json updated.");
    } else {
        console.log("Tidak ada loker baru. Mengirim notifikasi ke Telegram...");
        await sendTelegram(`😔 <b>BELUM ADA LOKER YANG TERSEDIA UNTUK SAAT INI</b>\n\nTenang, kami terus memantau dan akan memberitahu kamu segera jika ada lowongan baru!\n\n🤖 <i>This bot was Created by Arfi</i>`);
    }
}

scrape().then(() => {
    console.log("Scraping completed.");
    process.exit(0);
});
