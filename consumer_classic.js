const axios = require('axios');
const ENDPOINT_URL = 'http://localhost:3000/iot_broker/getmsg2';
const num = 1000; // mensajes que del dispatcher se sirven al sistema
const timeLectura = 1000; // cada segundo


const iniTime = Date.now();
const fs = require('fs');
const logFilePathConsumer = 'csv/consumer_classic.csv';
const logFilePathConsumerBatch = 'csv/consumer_classic_batch.csv';

// Prioridades de los mensajes, cuanto menor el número, mayor la prioridad, 1 indica máxima prioridad
const maxPriority = 1; // maxima prioridad
const minPriority = 4; // minima prioridad
const readMsgPriority = []; // Numero de elementos leidos por prioridad
for (let i = 0; i <= minPriority; i++) {
    readMsgPriority[i] = 0;
}

// Tiempos de expiracion
const priorityExpirationTimeQueue = [5000, 10000, 20000, 60000]; // tiempo de expiración de cada cola en ms



// Escribir en le archivo de log con timestap
function logMessage(file, message, printTimestamp = true) {
    const timestamp = Date.now();
    if (printTimestamp) {
        message = timestamp - iniTime + ';' + message;
    }
    fs.appendFile(file, message ,
        (err) => {
            if (err) {
                // Si ocurre un error, lo registramos en la consola
                console.error('Error writing to log file:', err);
                return;
            };
        })
}

// Si el archivo ya existe, lo eliminamos para empezar de nuevo
function initializeLogFiles() {
    fs.writeFileSync(logFilePathConsumer, '', 'utf8');
    fs.writeFileSync(logFilePathConsumerBatch, '', 'utf8');

    let text="";
    let text2="";
    let text3="";
    for (i=maxPriority;i<=minPriority;i++) {
        text+="Priority"+i+";";
        text2+="Exp"+i+";";
        text3+="Priority"+i+";";
    }
    logMessage(logFilePathConsumer, "Timestamp; Shipment ; ID; Priority; Msg timestamp; Time spent;"+text2+text3+"\n", false);
    logMessage(logFilePathConsumerBatch, "Timestamp; "+text+"Total read\n", false);
}

initializeLogFiles();


// Función que obtiene mensajes del broker IoT y los devuelve
async function getIoTBrokerMessage() {

    try {
        // Axios realiza la solicitud GET. Por defecto, ya espera que la respuesta sea JSON.
        const response = await axios.get(ENDPOINT_URL + "?num=" + num , {
            // Puedes añadir headers si el endpoint lo requiere (e.g., para autenticación)
            headers: {
                // 'Authorization': 'Bearer TU_TOKEN' 
            },
            // Opciones de configuración adicionales
            timeout: 5000 // Tiempo de espera de 5 segundos
        });
        console.log("Read ", response.data.numMsg, "  IoTBroker messages");
        return response.data;


    } catch (error) {
        // Axios lanza un error si la solicitud falla (problemas de red) o si
        // el servidor responde con un código 4xx o 5xx.

        if (error.response) {
            // El servidor respondió con un código de estado fuera del rango 2xx
            console.error(`\nServer error (${error.response.status}):`);
            console.error(error.response.data);
        } else if (error.request) {
            // La solicitud fue enviada, pero no se recibió respuesta (ej. timeout, servidor caído)
            console.error("\nNo response was received from the server.");
        } else {
            // Error de configuración o algo pasó antes de enviar la solicitud
            console.error("\nError configuring the request:", error.message);
        }
        return null;
    }

} 

async function consumeMessages() {
    console.clear()
    const data = await getIoTBrokerMessage();
    if (data === null || !data.mensajes || data.mensajes.length === 0) {
        console.error("Messages could not be obtained from the IoTBroker.\n");
        return;
    }
    // console.log(data.mensajes);
    let reg = "";
    // Para cada mensaje leido vamos a escribir en el archivo sus datos
    const timestamp = Date.now() - iniTime;
        message = timestamp - iniTime
    data.mensajes.forEach(msg => {
        readMsgPriority[msg.priority - 1]++;
        //console.log("Message received: ", msg);
        const tempSpent = timestamp - msg.timestamp;
        reg += timestamp +";"+msg.remesa + ";" + msg.id + ";" + msg.priority + ";" + msg.timestamp + ";" + tempSpent + ";";
        // Para cada prioridad vemos si ha caducado
        for (let i = maxPriority; i <= minPriority; i++) {
            if (msg.priority === i) {
                // Si es la prioridad del mensaje ha expiradop escribimos 1, sino 0
                if (tempSpent >= priorityExpirationTimeQueue[i - 1]) {
                    reg += "1;";
                } else {
                    reg += "0;";
                }    
            } else {
                reg += "0;";
            }
        }
        // Ahora añadimos 1 columna por cada tipo de prioridad, con 1 si la prioridad del mensaje es la i, sino 0
        for (let i = maxPriority; i <= minPriority; i++) {
            if (msg.priority === i) {
                reg += "1;";        
            } else {
                reg += "0;";
            }
        }

        reg += "\n";
    });
    logMessage(logFilePathConsumer, reg, false);
    reg="";
    readMsgPriority[minPriority] += data.mensajes.length;
    console.log("Consumer CLASSIC - Read messages by priority: ");
    for (let i = maxPriority; i <= minPriority; i++) {
        console.log("  Priority ", i, ": ", readMsgPriority[i - 1], " messages.");
        reg+=readMsgPriority[i - 1]+";";
    }
    console.log("  Total read ", readMsgPriority[minPriority], " messages.");
    reg+=readMsgPriority[i - 1]+";\n";
    logMessage(logFilePathConsumerBatch, reg, true);


}

setInterval(consumeMessages,timeLectura); 