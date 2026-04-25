const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

const FONNTE_TOKEN = 'v8422FEfwmCsbRhxHdw4';
const TARGET_NUMBER = process.env.FONNTE_TARGET || '08xxxxxxxxx'; // <-- Ganti dengan nomor tujuan Fonnte

const URLS = [
    'https://glints.com/id/opportunities/jobs/explore?keyword=admin&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?keyword=marketing&country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://glints.com/id/opportunities/jobs/explore?country=ID&locationId=5e666aa8-abfd-4d4a-a02e-2caaef368a09&locationName=Padang%2C+Sumatera+Barat&lowestLocationLevel=3&sortBy=LATEST',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat',
    'https://id.jobstreet.com/id/jobs/in-Sumatera-Barat?tags=new',
    'https://id.jobstreet.com/id/Admin-jobs/in-Sumatera-Barat?tags=new'
];

async function sendFonnte(message) {
    if (TARGET_NUMBER === '08xxxxxxxxx' && !process.env.FONNTE_TARGET) {
        console.log("Nomor target Fonnte belum diset. Melewati pengiriman pesan...");
        return;
    }
    
    try {
        const response = await axios.post('https://api.fonnte.com/send', {
            target: TARGET_NUMBER,
            message: message,
            countryCode: '62'
        }, {
            headers: {
                'Authorization': FONNTE_TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log('Fonnte Response:', response.data);
    } catch (error) {
        console.error('Error sending to Fonnte:', error.response ? error.response.data : error.message);
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
            
            const jobs = await page.evaluate((isGlints) => {
                let results = [];
                const links = document.querySelectorAll('a');
                for (let a of links) {
                    const text = a.innerText.trim();
                    const href = a.href;
                    if (!href) continue;
                    
                    if (isGlints) {
                        if (href.includes('/opportunities/jobs/') && !href.includes('/explore')) {
                            results.push({ title: text.split('\n')[0], link: href });
                        }
                    } else {
                        if (href.includes('/job/')) {
                             results.push({ title: text, link: href });
                        }
                    }
                }
                return results;
            }, url.includes('glints.com'));
            
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
        let message = `*Info Loker Terbaru Padang & Sumbar*\n\n`;
        let count = 0;
        
        for (let i = 0; i < newJobs.length; i++) {
            const job = newJobs[i];
            message += `${i+1}. *${job.title}*\nLink: ${job.cleanLink}\n\n`;
            count++;
            
            // Fonnte limit batch size to avoid overly long messages
            if (count % 10 === 0 || i === newJobs.length - 1) {
                await sendFonnte(message);
                message = `*Info Loker Terbaru Padang & Sumbar (Lanjutan)*\n\n`;
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
