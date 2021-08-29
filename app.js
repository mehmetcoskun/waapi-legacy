const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const open = require('open');
const CSVToJSON = require('csvtojson');
const cron = require('node-cron');
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

app.get('/auth', (req, res) => {
    var qrjs = fs.readFileSync('./qrcode.js');

    fs.readFile('./last.qr', (err, last_qr) => {
        fs.readFile('session.json', async (serr, sessiondata) => {
            if (err && sessiondata) {
                res.write(
                    '<html><body><h2>Already Authenticated</h2></body></html>'
                );
                res.end();
            } else if (!err && serr) {
                var page = `
                    <html>
                        <body>
                            <script>${qrjs}</script>
                            <div id="qrcode"></div>
                            <h2>if whatsapp does not accept please refresh the page for new qr code</h2>
                            <script type="text/javascript">
                                new QRCode(document.getElementById("qrcode"), "${last_qr}");
                            </script>
                        </body>
                    </html>
                `;
                res.write(page);
                res.end();
            }
        });
    });
});

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

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log('Configuring server, Please wait...');

    fs.readFile('./last.qr', (err) => {
        fs.readFile('session.json', async (serr) => {
            if (!err && serr) {
                await open(`http://localhost:${port}/auth`);

                console.log(
                    `if the qr code page does not open please go to this address: http://localhost:${port}/auth`
                );
            }
        });
    });
});
