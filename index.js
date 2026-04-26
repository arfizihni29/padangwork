const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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
        console.log("Telegram Token atau Chat ID belum diset. Melewati pengiriman pesan...");
        return;
    }
    
    try {
        const response = await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
        console.log('Telegram Response:', response.data.ok);
    } catch (error) {
        console.error('Error sending to Telegram:', error.response ? error.response.data : error.message);
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
    const browser = await puppeteer.launch({ 
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    let allJobs = [];

    for (let url of URLS) {
        console.log(`Scraping: ${url}`);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            
            const jobs = await page.evaluate((currentUrl) => {
                const isGlints = currentUrl.includes('glints.com');
                const isPintarnya = currentUrl.includes('pintarnya.com');
                const isKitaLulus = currentUrl.includes('kitalulus.com');
                let results = [];
                const links = document.querySelectorAll('a');
                for (let a of links) {
                    const text = a.innerText.trim();
                    const href = a.href;
                    if (!href) continue;

                    // Get context text to find date
                    let rawContainerText = '';
                    if (isGlints) {
                        let card = a.closest('div[class*="JobCard"]');
                        if (card) rawContainerText = card.innerText;
                    } else if (isPintarnya) {
                        // Pintarnya uses simple divs or cards
                        let card = a.parentElement && a.parentElement.parentElement;
                        if (card) rawContainerText = card.innerText;
                    } else if (isKitaLulus) {
                        rawContainerText = a.innerText;
                    } else {
                        let article = a.closest('article');
                        if (article) rawContainerText = article.innerText;
                    }

                    if (!rawContainerText) {
                        rawContainerText = (a.parentElement && a.parentElement.parentElement) 
                            ? a.parentElement.parentElement.innerText
                            : '';
                    }

                    let containerText = rawContainerText.toLowerCase();

                    // Freshness filter: max 4 days old
                    let isFresh = true;
                    if (containerText) {
                        if (containerText.includes('bulan') || containerText.includes('month') || 
                            containerText.includes('tahun') || containerText.includes('year') ||
                            containerText.includes('minggu') || containerText.includes('week') ||
                            containerText.includes('30+ hari') || containerText.includes('30+d')) {
                            isFresh = false;
                        } else {
                            let match = containerText.match(/(\d+)\s*(hari|day|d\s+ago)/);
                            if (match && parseInt(match[1]) > 4) {
                                isFresh = false;
                            }
                        }
                    }

                    if (!isFresh) continue;
                    
                    // Filter out unwanted jobs
                    if (containerText && (
                        containerText.includes('sales') ||
                        containerText.includes('penagihan') ||
                        containerText.includes('field collection') ||
                        containerText.includes('officeboy') ||
                        containerText.includes('office boy') ||
                        containerText.includes('cleaning service') ||
                        containerText.includes('kolektor') ||
                        containerText.includes('collector')
                    )) {
                        continue;
                    }
                    
                    // Filter out jobs meant strictly for males
                    if (containerText && (
                        containerText.includes('pria') || 
                        containerText.includes('laki-laki') || 
                        containerText.includes('laki laki') || 
                        containerText.includes('cowok')
                    )) {
                        if (!containerText.includes('wanita') && 
                            !containerText.includes('perempuan') && 
                            !containerText.includes('cewek')) {
                            continue; // It only asks for males, so skip
                        }
                    }
                    

                    // Extract salary
                    let salary = 'Gaji tidak ditampilkan';
                    if (rawContainerText) {
                        const lines = rawContainerText.split(/\n|\|/);
                        const salLine = lines.find(l => l.toUpperCase().includes('RP') || l.toUpperCase().includes('IDR'));
                        if (salLine) salary = salLine.trim();
                    }
                    
                    if (isGlints) {
                        if (href.includes('/opportunities/jobs/') && !href.includes('/explore')) {
                            results.push({ title: text.split('\n')[0], link: href, salary });
                        }
                    } else if (isPintarnya) {
                        if (href.includes('/lowongan/')) {
                            // pintarnya titles are sometimes separated by newline
                            results.push({ title: text.split('\n')[0], link: href, salary });
                        }
                    } else if (isKitaLulus) {
                        if (href.includes('/lowongan/')) {
                            results.push({ title: text.split('\n')[0], link: href, salary });
                        }
                    } else {
                        if (href.includes('/job/')) {
                             results.push({ title: text, link: href, salary });
                        }
                    }
                }
                return results;
            }, url);
            
            allJobs = allJobs.concat(jobs);
        } catch (e) {
            console.error(`Error scraping ${url}:`, e.message);
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
    }
}

scrape().then(() => {
    console.log("Scraping completed.");
    process.exit(0);
});
