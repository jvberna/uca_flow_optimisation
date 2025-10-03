/***
 * Variables para la conexión al classifier
 */
const axios = require('axios');
const ENDPOINT_URL = 'http://localhost:3100/classifier/getmsg';


/******
 * Variables del dispatcher para controlar su cola priorizada
 */

const sortPriorityQueu = [];
const maxSortQueu = -1; // número de colas priorizadas, -1 ignora el límite
const numMessages = 800; // número de mensajes a solicitar al classifier
const tiempoLectura = 100; // cada segundo
const porwerPriority = [];  // establecer el valor de potencia de cada cola de prioridad
const msgPerPriority = []; // mensajes por cada cola de prioridad
const maxPriority = 4;



// Creamos un endpoint que atiende '/iot_broker/getmsg?num=1234' solicitando X número de mensajes de la cola
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3200;

const iniTime = Date.now();
const fs = require('fs');
const logFilePathDispatcher = 'dispatcher.csv';
const logFilePathREST = 'dispatcher_REST.csv';

// Escribir en le archivo de log con timestap
function logMessage(file, message, printTimestamp = true) {
    const timestamp = Date.now();
    if (printTimestamp) {
        message = timestamp - iniTime + ';' + message;
    }
    fs.appendFile(file, message + '\n',
        (err) => {
            if (err) {
                // Si ocurre un error, lo registramos en la consola
                console.error('Error al escribir en el archivo de log:', err);
                return;
            };
        })
}

// Si el archivo ya existe, lo eliminamos para empezar de nuevo
function initializeLogFiles() {
    fs.writeFileSync(logFilePathDispatcher, '', 'utf8');
    fs.writeFileSync(logFilePathREST, '', 'utf8');

    logMessage(logFilePathDispatcher, "Timestamp; P1 ; PowerPriority; msgPerPriority; Reales Leidos (remainint); Reales recibidos;  P2 ; PowerPriority; msgPerPriority; Reales Leidos (remainint); Reales recibidos; P3 ; PowerPriority; msgPerPriority; Reales Leidos (remainint); Reales recibidos; P4 ; PowerPriority; msgPerPriority; Reales Leidos (remainint); Reales recibidos; Expirados; Solicitados; Leidos; Remaining final", false);
    logMessage(logFilePathREST, "Timestamp; Pedidos ; Extraidos; Quedan", false);
}

initializeLogFiles();

// Middleware para la ruta GET /dispatcher/getmsg
app.get(
    '/dispatcher/getmsg',
    [
        // Validaciones para los parámetros de la consulta
        query('num')
            .notEmpty()
            .withMessage('num es un campo requerido.')
            .isNumeric()
            .withMessage('num debe ser un numero.')
    ],
    (req, res) => {
        // Manejo de los errores de validación
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        // Si la validación es exitosa, procesa la solicitud
        const { num } = req.query;


        // desencolo de la cola de mensajes tantos mensajes como dice num
        // extraemos los mensajes del principio de la cola
        const returnMsg = sortPriorityQueu.splice(0, num);
        console.log('Desencolamos ', num, ' menajes de la cola. Quedan ', sortPriorityQueu.length, ' mensajes en la cola.');
        const reg = num + ";" + returnMsg.length + ";" + sortPriorityQueu.length;
        logMessage(logFilePathREST, reg, true);
        // Respondemos con los mensajes extraídos
        res.status(200).json({
            message: 'Extraer mensajes de la cola',
            data: req.query,
            mensajes: returnMsg,
            numMsg: returnMsg.length
        });
    }
);

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Dispatcher escuchando en http://localhost:${port}`);
    // Después de iniciar el servidor, comenzamos a generar mensajes
    launch();
});

// Cramos el array de powerPriority dando más prioridad a la cola 1, la mitad a la 2, la mitad a la 3... y luego convertimos eso en mensjaes de numMessages
const configurePowerPriority = () => {
    porwerPriority.push(1)
    for (let i = 1; i < maxPriority; i++) {
        porwerPriority.push(porwerPriority[i - 1] / 2);
    }
    console.log("Power Priority: ", porwerPriority);
}

const configureMsgPerPriority = () => {
    let resto = numMessages;
    let totalPowerPriority = 0;
    for (let i = 0; i < maxPriority; i++) {
        totalPowerPriority += porwerPriority[i];
    }
    for (let i = 0; i < maxPriority - 1; i++) {
        msgPerPriority.push(Math.round((porwerPriority[i] / totalPowerPriority) * numMessages, 0));
        resto -= msgPerPriority[i];
    }
    msgPerPriority.push(resto);
    console.log("Messages per Priority: ", msgPerPriority);
}

configurePowerPriority();
configureMsgPerPriority();


// Función que obtiene mensajes del broker IoT y los devuelve
async function getClassifierMessage(num, priority) {

    try {
        // Axios realiza la solicitud GET. Por defecto, ya espera que la respuesta sea JSON.
        const response = await axios.get(ENDPOINT_URL + "?num=" + num + "&priority=" + priority, {
            // Puedes añadir headers si el endpoint lo requiere (e.g., para autenticación)
            headers: {
                // 'Authorization': 'Bearer TU_TOKEN' 
            },
            // Opciones de configuración adicionales
            timeout: 5000 // Tiempo de espera de 5 segundos
        });
        return response.data;


    } catch (error) {
        // Axios lanza un error si la solicitud falla (problemas de red) o si
        // el servidor responde con un código 4xx o 5xx.

        if (error.response) {
            // El servidor respondió con un código de estado fuera del rango 2xx
            console.error(`\nError del servidor (${error.response.status}):`);
            console.error(error.response.data);
        } else if (error.request) {
            // La solicitud fue enviada, pero no se recibió respuesta (ej. timeout, servidor caído)
            console.error("\nNo se recibió respuesta del servidor.");
        } else {
            // Error de configuración o algo pasó antes de enviar la solicitud
            console.error("\nError al configurar la solicitud:", error.message);
        }
        return null;
    }

}

// Falta esta funcion ////////////////////////////////////////////
/****
 * Función que lee de cada cola, en función del power que tiene definido
 * y mete los mensajes en la cola priorizada
 * si lee menos mensajes de los solicitados, acumula a la siguiente cola el número de mensajes
 * y si quedan mensajes, lee de la de expirados
 */
async function readAndSort() {

    let totalRead = 0;
    let remaining = 0;
    let reg = "";

    for (let i = 0; i < maxPriority; i++) {
        // leemos mensajes de la cola de prioridad i+1
        //     la estructura devuelta estructura{
        //   message: 'Extraer mensajes de la cola prioridad' + priority,
        //   data: 'num: ' + num + ' priority:' + priority,
        //   mensajes: returnMsg,
        //   numMsg: returnMsg.length
        remaining += msgPerPriority[i];
        const data = await getClassifierMessage(remaining, i + 1);
        if (!data) {
            console.error("No se ha podido leer del Classifier");
            return;
        }        // Calculamos si ha sobrado potencia
        reg += (i + 1) + ";" + porwerPriority[i] + ";" + msgPerPriority[i] + ";" + remaining + ";" + data.numMsg + ";";
        remaining -= data.numMsg;
        // Acumulamos el total de mensajes leidos
        totalRead += data.numMsg;
        console.log(`Leídos ${data.numMsg} mensajes de la cola de prioridad ${i + 1}. Quedan ${remaining} mensajes por leer.`);
        // Metemos los mensajes leidos en la cola ordenada de prioridad
        if (data.numMsg > 0) {
            data.mensajes.forEach(msg => {
                sortPriorityQueu.push(msg)
            });
        }

        // Limitamos el tamaño de la cola priorizada a maxSortQueu o si -1 ignoramos el límite
        if (maxSortQueu > 0 && sortPriorityQueu.length > maxSortQueu) {
            sortPriorityQueu.splice(0, sortPriorityQueu.length - sortPriorityQueu)
        }
    }

    // si han quedado en remaining mensajes por leer, los leemos de la cola de expirados
    let dataExp;
    if (remaining > 0) {
        dataExp = await getClassifierMessage(remaining, 0);
        if (dataExp) {
            totalRead += dataExp.numMsg;
            // Metemos los mensajes leidos en la cola ordenada de prioridad
            if (dataExp.numMsg > 0) {
                dataExp.mensajes.forEach(msg => {
                    sortPriorityQueu.push(msg)
                });
            }
            reg += "0;" + remaining + ";" + dataExp.numMsg + ";" + remaining - dataExp.numMsg;
            remaining -= dataExp.numMsg;
            console.log(`Leídos ${dataExp.numMsg} mensajes de la cola de Expiración. Quedan ${remaining} mensajes por leer.`);

        } else {
            reg += "0;" + remaining + ";0;" + remaining;
        }
    }
    reg += "0;" + remaining + ";0;" + remaining;
    logMessage(logFilePathDispatcher, reg, true);


    console.log("\nTotal de mensajes leídos y metidos en la cola priorizada: ", totalRead);
    console.log("Tamaño actual de la cola priorizada: ", sortPriorityQueu.length);
}

// Ejecutamos la función de leer y ordenar cada segundo 
function launch() {
    setInterval(readAndSort, tiempoLectura);
}
