
/****
 * El controlador se conecta al broker IoT para solicitar mensajes de la cola y los reparte entre sus colas
 */


/***
 * Variables para la creación del endpoint REST
 */
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3100;


/***
 * Variables para la gestión de las colas de prioridades
 */

// Prioridades de los mensajes, cuanto menor el número, mayor la prioridad, 1 indica máxima prioridad
const maxPriority = 1; // maxima prioridad
const minPriority = 4; // minima prioridad


// Estructura de colas de mensajes
const priorityMsgQueues = [];
const priorityExpirationTimeQueue = [];
const baseExpirationTime = [5000, 10000, 20000, 60000]; // tiempo base de expiración en ms
const initialTimestamp = Date.now(); // Cuando se inicia el sistema

// Inicializamos cada cola a una lista vacía y los expiration time
for (let i = 0; i < minPriority; i++) {
  priorityMsgQueues[i] = [];
  // tiempo de expiración de cada cola comienza en 5seg * prioridad
  priorityExpirationTimeQueue[i] = baseExpirationTime[i];
}
 
// cola de expiración de mensajes
const expirationMsgQueue = [];
// Tiempo de comprobación de expiración de mensajes
const expirationVerifiction = 1000;
// Tamaño máximo de la cola de mensajes de expiración, -1 indica sin límite
const expirationMaxQueueMsg = -1;



/***
 * Variables para la conexión al broker IoT
 */
const axios = require('axios');
const ENDPOINT_URL = 'http://localhost:3000/iot_broker/getmsg';
const NUM_MESSAGES = 1000; // Número de mensajes a solicitar
const timeToReadIotBroker = 500; // Tiempo para leer del broker
// El numero de mensajes leidos por segundo es superior al de mensajes que puede leer el dispatcher, 
// se trata de que las colas de prioridades estén nutridas de mensajes si hay disponibles en el broker IoT
// la velocidad de cotegoriser puede ser igual o superior a la de produccion por IoT Broker

const iniTime = Date.now();

const fs = require('fs');
const logFilePathClassified = 'csv/categoriser.csv'; // Log de los mensajes leidos desde solicitados y leidos de IoT Broker
const logFilePathREST = 'csv/categoriser_REST.csv'; // Log de la actividad de llamadas REST recibidas desde Dispatcher
const logFilePathStatus = 'csv/categoriser_STATUS.csv'; // Log con el estado de las las colas
const logFilePathExpirations = 'csv/categoriserExpirations.csv'; // Log con la actividad de expiración de mensajes


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
        console.error('Error writing to log file:', err);
        return;
      };
    })
}

// Si el archivo ya existe, lo eliminamos para empezar de nuevo
function initializeLogFiles() {
  fs.writeFileSync(logFilePathClassified, '', 'utf8');
  fs.writeFileSync(logFilePathREST, '', 'utf8');
  fs.writeFileSync(logFilePathStatus, '', 'utf8');
  fs.writeFileSync(logFilePathExpirations, '', 'utf8');

  let txt1="";
  let txt2=""; 
  let txt3 = "";
  for (let i = 0; i < minPriority; i++) { 

    txt1 += " Remaining Q" + (i + 1) + ";";
    txt2 += " Q" + (i + 1) + ";";
    txt3 += " Q" + (i + 1) + " expired; Q" + (i + 1) + " remaining;";
  }
  logMessage(logFilePathClassified, "Timestamp; Request; Recovered; "+txt2, false);
  logMessage(logFilePathREST, "Timestamp; Requests by Dispatcher; Read by Dispatcher; Read Queue; " + txt1 + " Remaining queue expired", false);
  logMessage(logFilePathStatus, "Timestamp; " + txt2 + " Q Expirados", false);
  console.log('Iniciando textos:',txt3, txt2, txt1); 
  logMessage(logFilePathExpirations, "Timestamp; " + txt3 + " Total expired ; Expired queue", false);

}

initializeLogFiles();

// Middleware para la ruta GET /categoriser/getmsg
// debe indicar el número de mensaje sa leer y la cola desde la que lee, puede ser de maxPrioroty hasta minPriority o 0 para la cola de expiración
app.get(
  '/categoriser/getmsg',
  [
    // Validaciones para los parámetros de la consulta
    query('num')
      .notEmpty()
      .withMessage('num is a required field.')
      .isNumeric()
      .withMessage('num it must be a number.'),
    query('priority')
      .notEmpty()
      .withMessage('priority is a required field.')
      .isNumeric()
      .withMessage('priority It must be a number between 0 and ' + minPriority + '.'),

  ],
  (req, res) => {
    // Manejo de los errores de validación

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Si la validación es exitosa, procesa la solicitud
    const { num, priority } = req.query;

    // Si la prioridad indicada no es válida, devolvemos error
    if (priority < 0 || priority > minPriority) {
      return res.status(400).json({ errors: [{ msg: 'priority It must be a number between 0 and ' + minPriority + '.' }] });
    }

    // desencolo de la cola de prioridad de mensajes tantos mensajes como dice num
    // extraemos los mensajes del principio de la cola, los más antiguos
    let returnMsg = [];
    let msgRes = ""
    if (priority > 0) {
      returnMsg = priorityMsgQueues[priority - 1].splice(0, num);
      console.log('Dequeue', num, 'items from Q', priority, '. Remaining ', priorityMsgQueues[priority - 1].length, ' messages in the queue.');
      msgRes = "Extract from Q" + priority;
    } else {
      // prioridad 0 indica la cola de expiración
      returnMsg = expirationMsgQueue.splice(0, num);
      console.log('Dequeue', num, 'items from EXPIRATION queue. Remainingn ', expirationMsgQueue.length, ' queue items.');
      msgRes = "Extract from EXPIRATION";
    }

    //""Timestamp; Pedidos por  Dispatcher; Leidos por Dispatcher; Cola Leida; Quedan Cola P1; Quedan Cola P2; Quedan Cola P3; Quedan Cola P4, Quedan Cola Expirados""
    let msg = "";
    for (let i = maxPriority; i <= minPriority; i++) {
      msg += "Remaining Q" + priorityMsgQueues[i - 1].length + ";";
    }

    logMessage(logFilePathREST, num + ";" + returnMsg.length + ";" + priority + ";" + msg + expirationMsgQueue.length, true);

    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: msgRes,
      data: 'num: ' + num + ' priority:' + priority,
      mensajes: returnMsg,
      numMsg: returnMsg.length
    });
  }
);

// Iniciar el servidor
app.listen(port, () => {
  console.log(`CATEGORISER listening to http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  launch();
});


/**
 * Funcion para leer del endpoint IoT_broker
 * y realiza una solicitud GET al endpoint IoT y muestra el mensaje.
*/

// Función que obtiene mensajes del broker IoT y los devuelve
async function getIotMessages() {

  try {
    // Axios realiza la solicitud GET. Por defecto, ya espera que la respuesta sea JSON.
    const response = await axios.get(ENDPOINT_URL + "?num=" + NUM_MESSAGES, {
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
      console.error(`\nServer error (${error.response.status}):`);
      console.error(error.response.data);
    } else if (error.request) {
      // La solicitud fue enviada, pero no se recibió respuesta (ej. timeout, servidor caído)
      console.error("\nNo response was received from the server..");
    } else {
      // Error de configuración o algo pasó antes de enviar la solicitud
      console.error("\nError configuring the request:", error.message);
    }
    return null;
  }

}


// función que lee del broker IoT y clasifica los mensjaes recibidos en las colas de prioridad
async function readFromIotBrokerAndClassify() {
  console.clear();
  console.log("\n************ Reading from IoT Broker and classifying messages ************");
  let response = await getIotMessages();
  if (!response) {
    console.error("Unable to read from the IoT broker");
    return;
  }

  // Si no hay mensajes, salimos
  let msgs = response.mensajes;
  if (!msgs || msgs.length === 0) {
    console.log("There are no new messages on the IoT broker.");
    console.log("************ END Reading from IoT Broker and classifying messages ************\n\n");

    return;
  }
  //console.log("\nLeídos ", msgs.length, " mensajes del broker IoT: ", msgs);
  // Clasificamos los mensajes en las colas de prioridad
  // estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T}
  let totalReadPriorities = [];
  for (let i = maxPriority; i <= minPriority; i++) {
    totalReadPriorities[i - 1] = 0;
  }
  msgs.forEach(msg => {
    let p = msg.priority;
    if (p > minPriority || p < maxPriority) {
      console.error("Message with invalid priority: ", msg, " min:", minPriority, " max:", maxPriority);
    } else {
      //console.log("Cola de prioridad ",p," recibe mensaje ",msg);
      priorityMsgQueues[p - 1].push(msg);
      totalReadPriorities[p - 1]++;
    }
  });
  // "Timestamp; Solicitados; Recuperados; Leidos P1; Leidos P2; Leidos P3; Leidos P4"
  let msg = "";
  for (let i = maxPriority; i <= minPriority; i++) {
    msg += totalReadPriorities[i - 1] + ";";
  }
  logMessage(logFilePathClassified, NUM_MESSAGES + ";" + msgs.length + ";" + msg, true);
  showQueuesStatus();
  console.log("************ END Reading from IoT Broker and classifying messages ************\n\n");

}

// función que muestra el estado de las colas por pantalla
function showQueuesStatus() {
  // Mostramos el estado de las colas
  //console.clear();
  console.log("-----------------------------------------------------");
  console.log("Status of priority queues after reading from the IoT broker:");
  let msg = "Expiration: "
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "P" + (i + 1) + ":" + priorityExpirationTimeQueue[i] + "ms ";
  }
  console.log(msg);

  msg = "Size: ";
  let txt = "";
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    msg += "Queue: " + (i + 1) + " : " + priorityMsgQueues[i].length + " ";
    txt += priorityMsgQueues[i].length + ";";
  }
  console.log(msg);
  console.log("expiredQueue ", expirationMsgQueue.length, " msg.");
  console.log("-----------------------------------------------------");
  // "Timestamp; Q1; Q2; Q3; Q4; Expirados"
  logMessage(logFilePathStatus, txt + expirationMsgQueue.length, true);
}

// función que gestiona la expiración de mensajes en la cola de expiración
// Recorremos todas las colas
// estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T} 
// Mientras que los mensajes de la cola estén expirados, los sacamos y los metemos en la cola de expiraciones
async function expirationMsgQueueHandler() {
  console.log("************ Checking message expirations ************");
  now = Date.now() - initialTimestamp;
  let expiredCount = 0;
  let totalExpired = 0; 
  let reg = "";
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    expiredCount = 0;
    // Mientras que en una cola haya mensajes y el mensaje más antiguo esté expirado
    while (priorityMsgQueues[i].length > 0 && (now - priorityMsgQueues[i][0].timestamp) > priorityExpirationTimeQueue[i]) {
      // extaemos el mensaje expirado y lo añadimos a la cola de expiraciones
      expiredMsg = priorityMsgQueues[i].shift()
      //console.log(now," Expirado mensaje ", expiredMsg, " tiempo ", now - expiredMsg.timestamp , " la cola prioridad ",i," ahora tiene ", priorityMsgQueues[i].length, " mensajes y expriedQ ",expirationMsgQueue.length);
      expirationMsgQueue.push(expiredMsg);
      expiredCount++;
    }
    totalExpired += expiredCount;
    reg += expiredCount + ";" + priorityMsgQueues[i].length + ";";
    if (expiredCount > 0) console.log("---> Expired P", i + 1, ":", expiredCount, "(exp.", priorityExpirationTimeQueue[i], " ms.) - expQueue: ", expirationMsgQueue.length, "msg.");
  }
  // "Timestamp; " + txt3 + " Total Expirados; Cola Expirados"
  reg += totalExpired + ";" + expirationMsgQueue.length;
  logMessage(logFilePathExpirations, reg, true);

  showQueuesStatus();
  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (expirationMaxQueueMsg > 0 && expirationMsgQueue.length > expirationMaxQueueMsg) {
    expirationMsgQueue.splice(0, expirationMsgQueue.length - expirationMaxQueueMsg)
  }
  console.log("************ END Checking message expirations ************\n\n");


}

const launch = () => {
  // Leemos del broker IoT cada cierto tiempo
  setInterval(readFromIotBrokerAndClassify, timeToReadIotBroker);
  // Gestionamos la expiración de mensajes cada cierto tiempo
  setInterval(expirationMsgQueueHandler, expirationVerifiction);
}


