const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs-extra');
const prompt = require('prompt-sync')();

async function conectarIMAP(usuario, contraseña) {
    const imap = new Imap({
        user: usuario,
        password: contraseña,
        host: 'mail.empresa31.empresadns.net',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
    });

    return new Promise((resolve, reject) => {
        imap.once('ready', () => {
            console.log("Conectado exitosamente al servidor IMAP.");
            resolve(imap);
        });
        imap.once('error', (error) => {
            console.error("Error al conectar con el servidor IMAP:", error);
            reject(error);
        });
        imap.connect();
    });
}

async function buscarCorreosAntiguos(imap) {
    const unAñoAtrás = new Date();
    unAñoAtrás.setDate(unAñoAtrás.getDate() - 365);// tiempo 

    return new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
            if (err) {
                console.error("Error al abrir el INBOX:", err);
                reject(err);
                return;
            }

            const criterioBusqueda = ['ALL', ['BEFORE', unAñoAtrás]];
            imap.search(criterioBusqueda, (err, results) => {
                if (err) {
                    console.error("Error al buscar correos:", err);
                    reject(err);
                    return;
                }
                console.log(`Encontrados ${results.length} correos antiguos.`);
                resolve(results);
            });
        });
    });
}

async function descargarYGuardarCorreos(imap, correos) {
    const rutaCarpeta = `${process.env.HOME || process.env.USERPROFILE}/Desktop/CorreosAntiguos`;
    await fs.ensureDir(rutaCarpeta);

    const promesas = correos.map(numCorreo => {
        return new Promise((resolve, reject) => {
            const f = imap.fetch(numCorreo, { bodies: '' });
            f.on('message', (msg, seqno) => {
                let mensajeCompleto = '';
                msg.on('body', (stream, info) => {
                    stream.on('data', (chunk) => {
                        mensajeCompleto += chunk.toString('utf8');
                    });
                });
                msg.once('end', async () => {
                    const correoParseado = await simpleParser(mensajeCompleto);
                    const rutaArchivo = `${rutaCarpeta}/correo-${seqno}.eml`;
                    await fs.writeFile(rutaArchivo, mensajeCompleto);
                    console.log(`Correo guardado en: ${rutaArchivo}`);
                    resolve();
                });
            });
            f.once('error', (err) => reject(err));
        });
    });

    await Promise.all(promesas);
}

async function borrarCorreos(imap, correos) {
    return new Promise((resolve, reject) => {
        imap.addFlags(correos, 'DELETED', (err) => {
            if (err) {
                console.error("Error al marcar correos para borrado:", err);
                reject(err);
                return;
            }
            imap.expunge((err) => {
                if (err) {
                    console.error("Error al expulsar correos:", err);
                    reject(err);
                    return;
                }
                console.log("Correos borrados exitosamente.");
                resolve();
            });
        });
    });
}
async function main() {
    const usuario = prompt('Ingrese su usuario de correo: ');
    const contraseña = prompt('Ingrese su contraseña: ', { echo: '*' });

    try {
        const imap = await conectarIMAP(usuario, contraseña);
        const correosAntiguos = await buscarCorreosAntiguos(imap);
        await descargarYGuardarCorreos(imap, correosAntiguos);

        const borrar = prompt('¿Desea borrar los correos descargados? (s/n): ').toLowerCase();
        if (borrar === 's') {
            await borrarCorreos(imap, correosAntiguos);
        }

        imap.end();
        console.log("Proceso completado.");
    } catch (error) {
        console.error('Error en el proceso:', error);
    }
}

main();


