const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const CSVToJSON = require('csvtojson');
const cron = require('node-cron');
const qrcode = require('qrcode-terminal');
const readline = require('readline');
const { Client } = require('whatsapp-web.js');
const app = express();

const config = require('./config.json');
const SESSION_FILE_PATH = './session.json';

app.use(bodyParser.json({ limit: '50mb' }));

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionCfg = require(SESSION_FILE_PATH);
}

process.title = 'waapi';
global.client = new Client({
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--unhandled-rejections=strict',
        ],
    },
    session: sessionCfg,
});

global.authed = false;

client.on('qr', (qr) => {
    fs.writeFileSync('./last.qr', qr);
});

client.on('authenticated', (session) => {
    console.log('You logged in!');
    sessionCfg = session;

    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
            console.error(err);
        }
        authed = true;
    });

    try {
        fs.unlinkSync('./last.qr');
    } catch (err) {}
});

client.on('auth_failure', () => {
    console.log('Authentication Failed!');
    sessionCfg = '';
    process.exit();
});

client.on('ready', () => {
    console.log('Timers are active, have fun ☕');

    // send message contacts in the contacts.csv file at 9 am every day.
    cron.schedule(
        '0 9 * * *',
        () => {
            CSVToJSON()
                .fromFile('contacts.csv')
                .then((contacts) => {
                    contacts.map((data) => {
                        client
                            .sendMessage(
                                data.number + '@c.us',
                                config.messages.at_9am
                            )
                            .then((response) => {
                                if (response.id.fromMe) {
                                    console.log(`Sent to ${data.name}`);
                                }
                            });
                    });
                });
        },
        {
            scheduled: true,
            timezone: config.timezone,
        }
    );

    // send message my contacts at night.
    cron.schedule(
        '0 0 * * *',
        () => {
            client.getContacts().then((contacts) => {
                contacts.map((data) => {
                    client
                        .sendMessage(
                            data.number + '@c.us',
                            config.messages.at_night
                        )
                        .then((response) => {
                            if (response.id.fromMe) {
                                console.log(`Sent to ${data.name}`);
                            }
                        });
                });
            });
        },
        {
            scheduled: true,
            timezone: config.timezone,
        }
    );
});

client.initialize();

const createQR = (qr) => {
    qrcode.generate(qr, { small: true }, function (qrcode) {
        console.log(qrcode);
        console.log('=============================================');
        console.log('Please scan the following QR code on whatsapp.');
        console.log('Press the "r" to new QR Code.');
    });
};

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log('Configuring server, Please wait...');

    fs.readFile('./last.qr', (err, last_qr) => {
        fs.readFile('session.json', async (serr) => {
            if (!err && serr) {
                createQR(last_qr.toString());
                readline.emitKeypressEvents(process.stdin);
                process.stdin.setRawMode(true);
                process.stdin.on('keypress', (str, key) => {
                    if (key.ctrl && key.name === 'c') {
                        process.exit();
                    } else if (key.name === 'r') {
                        createQR(last_qr.toString());
                    }
                });
            }
        });
    });
});
