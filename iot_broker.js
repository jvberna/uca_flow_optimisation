/****
 * 
 * iot_broker simula un broker de mensajes IoT, que genera mensajes de forma aleatoria y los almacena en una cola.
 * Cada mensaje tiene una estructura interna con un remesa, id, prioridad y timestamp.
 * 
 * Para leer del broquer se usa la ruta GET localhost:3000/iot_broker/getmsg?num=1234
 * el num indica cuantos mensajes se quieren leer de la cola.
 * Si hay menos mensajes en la cola que los solicitados, se devuelven todos los que haya.
 * Los mensajes leidos se eliminan de la cola.
 * 
 * La generación de mensajes es aleatoria, tanto en número de mensajes generados como en el tiempo entre remesas.
 * 
 */


// Creamos un endpoint que atiende '/iot_broker/getmsg?num=1234' solicitando X número de mensajes de la cola
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3000;

const iniTime = Date.now();

const fs = require('fs');

// Rutas de los archivos de log
const logFilePathRemesa = 'csv/iot_broker_generation.csv';  // se almacena información sobre las remesas generadas
const logFilePathREST = 'csv/iot_broker_REST.csv';  // se almacena información sobre las peticiones recibidas
const logFilePathREST2 = 'csv/iot_broker_REST2.csv';  // se almacena información sobre las peticiones recibidas del segundo endpoint
const logFilePathGenerate = 'csv/iot_broker_generated.csv';  // se almacena todo lo que se ha generado

// Cola de mensajes
let msgQueue = [];
let msgQueue2 = [];
// Contador de remesas
let countShipment = 0; 

// Máximo y mínimo mensajes a generar en cada remesa
const maxMsg = 1000;
const minMsg = 300;
const iniTimestamp = Date.now();

// Cada X remesas vamos a alternar entre día y noche, de día se generan más mensajes que de noche
let isDay = true;
const shipmentChange = 500; // Cada X remesas cambiamos de día a noche o viceversa
const factorNight = 0.2; // Factor para aumentar los mensajes de día

// Tiempo máximo en ms para generar una nueva remesa de mensajes
const maxTimeToGenerateMsg = 1000;
// Prioridades de los mensajes, cuanto menor el número, mayor la prioridad, 1 indica máxima prioridad
const maxPriority = 1; // maxima prioridad
const minPriority = 4; // minima prioridad
// Distribucion de prioridades entre los mensajes, esto es el porcentaje de mensajes que tendrán cada prioridad
// debe sumar 1.0 y haber tantos como prioridades
const weights = [0.05, 0.15, 0.30, 0.50];
// Controlar el número máximo de mensajes en la cola para depuración, -1 indica sin límite
const maxQueueMsg = -1;

// Mensajes totales a producir y contador de cuantos lleva hasta ahora
const totalMessages = 100000; 
let producedMessages = 0;

// Escribir en le archivo de log con/sin timestap
function logMessage(file, message, printTimestamp = true) { 
  const timestamp = Date.now(); 
  // Si se indica, añadimos el timestamp al inicio del mensaje
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

// Inicializar los archivos de log, borrando su contenido previo y escribiendo la cabecera
function initializeLogFiles() {
  fs.writeFileSync(logFilePathRemesa, '', 'utf8');
  fs.writeFileSync(logFilePathREST, '', 'utf8');
  fs.writeFileSync(logFilePathREST2, '', 'utf8');
  fs.writeFileSync(logFilePathGenerate, '', 'utf8');
  logMessage(logFilePathRemesa, "Timestamp; Shipment; Messages generated in shipment; Queue lenght; Next shipment; Total produced", false);
  logMessage(logFilePathREST, "Timestamp; Read by categoriser; Remaining in queue", false);
  logMessage(logFilePathREST2, "Timestamp; Read by consumer; Remaining in queue", false);
  logMessage(logFilePathGenerate, "Timestamp; Shipment; ID; Priority", false);
}

initializeLogFiles();

// Middleware para la ruta GET /iot_broker/getmsg
app.get(
  '/iot_broker/getmsg',
  [
    // Validaciones para los parámetros de la consulta
    query('num')
      .notEmpty()
      .withMessage('num is a required field.')
      .isNumeric()
      .withMessage('num must be a number.')
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
    const returnMsg = msgQueue.splice(0, num);
    //console.log('Desencolamos ', num, ' menajes de la cola. Quedan ', msgQueue.length, ' mensajes en la cola.');
    // logFilePathREST: "Timestamp; Leidos por Classifier; Quedan en cola"
    logMessage(logFilePathREST, num + ";" + msgQueue.length, true);
    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: 'Pull messages from the queue',
      data: req.query,
      mensajes: returnMsg
    });
  }
);

// Middleware para la ruta GET /iot_broker/getmsg2
// esta llamada es para un consumer normal que no sabe manejar prioridades
app.get(
  '/iot_broker/getmsg2',
  [
    // Validaciones para los parámetros de la consulta
    query('num')
      .notEmpty()
      .withMessage('num is a required field.')
      .isNumeric()
      .withMessage('num must be a number.')
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
    const returnMsg = msgQueue2.splice(0, num);
    // logFilePathREST: "Timestamp; Leidos por Classifier; Quedan en cola"
    logMessage(logFilePathREST2, num + ";" + msgQueue2.length, true);
    // Respondemos con los mensajes extraídos
    res.status(200).json({
      message: 'Pull messages from the queue',
      data: req.query,
      mensajes: returnMsg,
      numMsg: returnMsg.length
    });
  }
);

// Iniciar el servidor
app.listen(port, () => {
  console.log(`IoT Broker listening to http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  genMsg();
});

 
// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
const genPriority = () => {
  const valor = Math.random();

  for (let i = 0; i < weights.length - 1; i++) {
    if (valor <= weights[i]) {
      return i + 1; // Prioridades van de maxPriority hasta minPriority, 1 a 4
    }
  }
  return weights.length; // En caso de que no se cumpla ninguna condición, devolvemos la prioridad más baja
}

// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const genMsg = () => {
  countShipment++;
  if (countShipment % shipmentChange === 0) {
    isDay = !isDay;
    console.log('----------- CHANGE TO ', isDay ? 'DAY' : 'NIGHT', ' -----------');
  }

  let newMsg = 0;
  if (producedMessages > totalMessages) {
    newMsg = 0;
  } else { 

    newMsg = Math.round((Math.random() * (maxMsg - minMsg))) + minMsg;
    // Si no es día, reducimos el número de mensajes por factor noche
    if (!isDay) {
      newMsg = Math.round(newMsg * (factorNight));
    }
  }
  // hacemos push de los mensajes a la cola (encola al final)
  // estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T}
  let pri = 0;
  let reg2 = "";
  let ts = 0;
  for (let i = 0; i < newMsg; i++) {
    pri = genPriority();
    ts = Date.now() - iniTimestamp;
    msgQueue.push(
      {
        remesa: countShipment,
        id: countShipment + '_' + i,
        priority: pri,
        timestamp: ts
      });
    msgQueue2.push(
      {
        remesa: countShipment,
        id: countShipment + '_' + i,
        priority: pri,
        timestamp: ts
      });


    reg2 += Date.now() + ";" + countShipment + ";" + countShipment + '-' + i + ";" + pri + "\n";
  }
  // Acumulamos el número total de mensajes producidos
  producedMessages += newMsg;
  // Escribimos en logFilePathGenerate: "Timestamp; Remesa; ID; Priority"
  logMessage(logFilePathGenerate, reg2, false);

  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  // Esto no suele hacerse ya que si no se pierden mensajes, pero es útil para depuración
  if (maxQueueMsg > 0 && msgQueue.length > maxQueueMsg) {
    msgQueue.splice(0, msgQueue.length - maxQueueMsg)
  }
  if (maxQueueMsg > 0 && msgQueue2.length > maxQueueMsg) {
    msgQueue2.splice(0, msgQueue2.length - maxQueueMsg)
  }


  // programamos la siguiente generación de mensajes
  const nextShipment = Math.round(Math.random() * maxTimeToGenerateMsg);
  console.log('Rem:', countShipment, ' Gen:', newMsg, ' Next:', nextShipment, 'ms Que:', msgQueue.length, ' Que2:', msgQueue2.length,' Tot:', producedMessages);
  // Escribimos en logFilePathRemesa: "Timestamp; Remesa; Mensajes generado en remesa; Cola Longitud; SiguienteRemesa; Total Producidos"
  const reg = countShipment + ';' + newMsg + ';' + msgQueue.length + ";" + nextShipment + ";" + producedMessages;
  logMessage(logFilePathRemesa, reg, true);

  setTimeout(genMsg, nextShipment);
}

