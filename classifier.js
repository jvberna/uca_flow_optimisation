
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

// Prioridades de los mensajes
const maxPriority = 4;
const minPriority = 1;

// Estructura de colas de mensajes
const priorityMsgQueues = [];
for (let i = 0; i < maxPriority; i++) {
  priorityMsgQueues[i] = [];
}

// cola de expiración de mensajes
const expirationMsgQueue = [];
const expirationTime = 50000; // 10 segundos
const expirationVerifiction = 1000; // cada 1 segundo
const expirationMaxQueueMsg = 50000; // máximo mensajes en la cola de expiración, si se supera, se eliminan los más antiguos


// Tiempo para lectura de la cola del broker IoT
const timeToReadIotBroker = 2000; // cada 2 segundos


/***
 * Variables para la conexión al broker IoT
 */
const axios = require('axios');
const { response } = require('express');
const ENDPOINT_URL = 'http://localhost:3000/iot_broker/getmsg';
const NUM_MESSAGES = 3000; // Número de mensajes a solicitar



// Middleware para la ruta GET /iot_broker/getmsg
app.get(
  '/classifier/getmsg',
  [
    // Validaciones para los parámetros de la consulta
    query('num')
      .notEmpty()
      .withMessage('num es un campo requerido.')
      .isNumeric()
      .withMessage('num debe ser un numero.'),
    query('priority')
      .notEmpty()
      .withMessage('priority es un campo requerido.')
      .isNumeric()
      .withMessage('priority debe ser un numero entre 0 y '+maxPriority+'.'),

  ],
  (req, res) => {
    // Manejo de los errores de validación
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Si la validación es exitosa, procesa la solicitud
    const { num, priority } = req.query;

    if (priority < 0 || priority > maxPriority) {
      return res.status(400).json({ errors: [{ msg: 'priority debe ser un numero entre 0 y '+maxPriority+'.' }] });
    }
    console.log("Priority: ", priority);

    // desencolo de la cola de prioridad de mensajes tantos mensajes como dice num
    // extraemos los mensajes del principio de la cola
    let returnMsg = [];
    if (priority>0) {
      returnMsg = priorityMsgQueues[priority-1].splice(0, num);
      console.log('Desencolamos ', num, ' menajes de la cola ', priority, '. Quedan ', priorityMsgQueues[priority-1].length, ' mensajes en la cola.');
    } else {
      returnMsg = expirationMsgQueue.splice(0, num);
      console.log('Desencolamos ', num, ' menajes de la cola EXPIRACIÓN. Quedan ', expirationMsgQueue.length, ' mensajes en la cola.');
    }

    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: 'Extraer mensajes de la cola prioridad' + priority,
      data: 'num: ' + num + ' priority:' + priority,
      mensajes: returnMsg
    });
  }
);

// Iniciar el servidor
app.listen(port, () => {
  console.log(`CLASSIFIER escuchando en http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  launch();
});







/**
 * Funcion para leer del endpoint IoT_broker
 * ealiza una solicitud GET al endpoint IoT y muestra el mensaje.
*/

// Función que obtiene mensajes del broker IoT y los devuelve
async function getIotMessage() {

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




// función que lee del broker IoT y clasifica los mensjaes recibidos en las colas de prioridad
async function readFromIotBroker() {
  let resonse = await getIotMessage();
  if (!resonse) {
    console.error("No se ha podido leer del broker IoT");
    return;
  }
  // Clasificamos los mensajes en las colas de prioridad
  // estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T}
  let msgs = resonse.mensajes;
  //console.log("\nLeídos ", msgs.length, " mensajes del broker IoT: ", msgs);
  msgs.forEach(msg => {
    let p = msg.priority;
    if (p < minPriority || p > maxPriority) {
      console.error("Mensaje con prioridad inválida: ", msg);
    } else {
      //console.log("Cola de prioridad ",p," recibe mensaje ",msg);
      priorityMsgQueues[p - 1].push(msg);

    }
  });

  // Mostramos el estado de las colas
  console.log("-----------------------------------------------------");
  console.log("\nEstado de las colas de prioridad tras leer del broker IoT:");
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    console.log("Cola de prioridad ", i + 1, " tiene ", priorityMsgQueues[i].length, " mensajes.");
  }
  console.log("-----------------------------------------------------");
}

// función que gestiona la expiración de mensajes en la cola de expiración
async function expirationMsgQueueHandler() {
  // Recorremos todas las colas
  // estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T} 
  // Mientras que los mensajes de la cola estén expirados, los sacamos y los metemos en la cola de expiraciones
  now = Date.now();
  let expiredCount = 0;
  for (let i = 0; i < priorityMsgQueues.length; i++) {
    while (priorityMsgQueues[i].length > 0 && (now - priorityMsgQueues[i][0].timestamp) > expirationTime) {
      expiredMsg = priorityMsgQueues[i].shift()
      //console.log(now," Expirado mensaje ", expiredMsg, " tiempo ", now - expiredMsg.timestamp , " la cola prioridad ",i," ahora tiene ", priorityMsgQueues[i].length, " mensajes y expriedQ ",expirationMsgQueue.length);
      expirationMsgQueue.push(expiredMsg);
      expiredCount++;
    }
    console.log(expiredCount, " expirado de priority ",i,", la cola de expiración tiene ", expirationMsgQueue.length, " mensajes.");
  }

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (expirationMaxQueueMsg > 0 && expirationMsgQueue.length > expirationMaxQueueMsg) {
    expirationMsgQueue.splice(0, expirationMsgQueue.length - expirationMaxQueueMsg)
  }

}

const launch = () => {
  // Leemos del broker IoT cada cierto tiempo
  setInterval(readFromIotBroker, timeToReadIotBroker);
  // Gestionamos la expiración de mensajes cada cierto tiempo
  setInterval(expirationMsgQueueHandler, expirationVerifiction);
}














/*
// Creamos un endpoint que atiende '/iot_broker/getmsg?num=1234' solicitando X número de mensajes de la cola
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3000;
const rute = '/iot_broker/getmsg';

// Middleware para la ruta GET /iot_broker/getmsg
app.get( 
  rute,
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
    const returnMsg = colaMensajes.splice(0, num);
    console.log('Desencolamos ',num,' menajes de la cola. Quedan ',colaMensajes.length,' mensajes en la cola.');
    
    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: 'Extraer mensajes de la cola',
      data: req.query,
      mensajes: returnMsg
    });
  }
);

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  crearMensajes();
});

let colaMensajes = [];
let contador = 0;
// Máximo y mínimo mensajes a generar en cada remesa
const maxMensajes = 10;
const minMensajes = 5;
// Tiempo máximo en ms para generar una nueva remesa de mensajes
const maxTimeToGenerateMsg = 1000;
// Prioridades de los mensajes
const maxPriority = 4;  
const minPriority = 1;

// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
const genPriority = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const crearMensajes = () => {
  contador++;
  const newMsg = Math.round((Math.random()*(maxMensajes - minMensajes))) + minMensajes;

  // hacemos push de los mensajes a la cola (encola al final)
  for (let i=0; i<newMsg; i++) {
    colaMensajes.push( 
      { remesa: contador, 
        id: contador+'-'+i , 
        priority : genPriority(minPriority, maxPriority) ,
        timestamp: Date.now()
      } );
  }

  // programamos la siguiente generación de mensajes
  const siguiente = Math.round(Math.random()*maxTimeToGenerateMsg);
  console.log(contador,'.- Genero ',newMsg, ' nuevos mensajes, la cola tiene ',colaMensajes.length,'. Siguiente en ',siguiente, 'ms ');
  setTimeout(crearMensajes, siguiente);
}
*/
