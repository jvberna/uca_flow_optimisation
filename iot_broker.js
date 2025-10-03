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
const { time, log } = require('console');
const express = require('express');
const { query, validationResult } = require('express-validator');

const app = express();
const port = 3000;

const iniTime = Date.now();

const fs = require('fs');
const logFilePathRemesa = 'iot_broker_generation.csv';  // se almacena información sobre las remesas generadas
const logFilePathREST = 'iot_broker_REST.csv';  // se almacena información sobre las peticiones recibidas
const logFilePathGenerate = 'iot_broker_generated.csv';  // se almacena todo lo que se ha generado


let msgQueue = [];
// Contador de remesas
let contador = 0;

// Máximo y mínimo mensajes a generar en cada remesa
const maxMensajes = 1000;
const minMensajes = 300;

// Cada X remesas vamos a laternar entre día y noche, de día se generan más mensajes que de noche
let esDia = true;
const remesasCambiar = 500; // Cada X remesas cambiamos de día a noche o viceversa
const factorNoche = 0.2; // Factor para aumentar los mensajes de día

// Tiempo máximo en ms para generar una nueva remesa de mensajes
const maxTimeToGenerateMsg = 100;
// Prioridades de los mensajes
const maxPriority = 4;
const minPriority = 1;
// Controlar el número máximo de mensajes en la cola para depuración, -1 indica sin límite
const maxQueueMsg = -1;

const totalMessages = 1000000; // Mensajes totales a producir
let producedMessages = 0;

// Escribir en le archivo de log con timestap
function logMessage(file, message, printTimestamp = true) {
  const timestamp =  Date.now();
  if (printTimestamp) {
    message = timestamp - iniTime + ';' + message;
  }
  fs.appendFile(file,  message + '\n',
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
  fs.writeFileSync(logFilePathRemesa, '', 'utf8');
  fs.writeFileSync(logFilePathREST, '', 'utf8');
  fs.writeFileSync(logFilePathGenerate, '', 'utf8');
  logMessage(logFilePathRemesa,"Timestamp; Remesa; Mensajes generado en remesa; Cola Longitud; SiguienteRemesa; Total Producidos", false);
  logMessage(logFilePathREST,"Timestamp; Leidos por Classifier; Quedan en cola", false);
  logMessage(logFilePathGenerate,"Timestamp; Remesa; ID; Priority", false);
}

initializeLogFiles();

// Middleware para la ruta GET /iot_broker/getmsg
app.get(
  '/iot_broker/getmsg',
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
    const returnMsg = msgQueue.splice(0, num);
    console.log('Desencolamos ', num, ' menajes de la cola. Quedan ', msgQueue.length, ' mensajes en la cola.');
    logMessage( logFilePathREST , num + ";"+msgQueue.length, true);
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
  console.log(`IoT Broker escuchando en http://localhost:${port}`);
  // Después de iniciar el servidor, comenzamos a generar mensajes
  crearMensajes();
});




// Función para generar una prioridad aleatoria entre min y max (ambos inclusive)
/****
         * 
         * Con las prioridas, cuanta más prioridad (1) menos mensajes de esa prioridad, y con menos prioridad (4) más mensajes de esa prioridad
         * 
         */
const genPriority = (min, max) => {
  // Establecemos un peso para cada prioridad, de forma que la distribución de mensajes se esta
  const weights = [0.05, 0.15, 0.30, 0.50]; // Pesos para las prioridades 1 a 4
  const valor = Math.random();

  for (let i = 0; i < weights.length-1; i++) {
    if (valor <= weights[i]) {
      return i + 1; // Prioridades van de 1 a 4
    }
  }

  return weights.length; // En caso de que no se cumpla ninguna condición, devolvemos la prioridad más baja
}

// Función que genera mensajes de forma aleatoria y los añade a la cola
// Los mensajes se encolan al final de la cola
// Cada mensaje tiene la estructura { remesa: X, id: X-Y, priority: Z }
const crearMensajes = () => {
  contador++;
  if (contador % remesasCambiar === 0) {
    esDia = !esDia; 
    console.log('----------- CAMBIO Ahora es ', esDia ? 'DÍA' : 'NOCHE');
  }

  let newMsg = 0;
  if (producedMessages > totalMessages) {
    newMsg = 0;
  } else {

    newMsg = Math.round((Math.random() * (maxMensajes - minMensajes))) + minMensajes;
    // Si no es día, reducimos el número de mensajes por factor noche
    if (!esDia) {
      newMsg = Math.round(newMsg * (factorNoche));
    }
  }
  // hacemos push de los mensajes a la cola (encola al final)
  // estructura del mensaje { remesa: X, id: X-Y, priority: Z , timestamp: T}
  let pri = 0; 
  let reg2="";
  for (let i = 0; i < newMsg; i++) {
    pri = genPriority(minPriority, maxPriority);
    msgQueue.push(
      {
        remesa: contador,
        id: contador + '-' + i,
        priority: pri,
        timestamp: Date.now()
      });
      reg2+=Date.now()+";"+contador+";"+contador + '-' + i +";" + pri +"\n";
    }
    producedMessages += newMsg;
    logMessage(logFilePathGenerate, reg2, false);




  // Si en la cola hay más mensajes de los permitidos, eliminamos los más antiguos
  if (maxQueueMsg > 0 && msgQueue.length > maxQueueMsg) {
    msgQueue.splice(0, msgQueue.length - maxQueueMsg)
  }

  // programamos la siguiente generación de mensajes
  const siguiente = Math.round(Math.random() * maxTimeToGenerateMsg);
  console.log('Remesa ', contador, '.- Genero ', newMsg, ' nuevos mensajes, la cola tiene ', msgQueue.length, '. Siguiente en ', siguiente, 'ms . Producidos ', producedMessages);
  // "Timestamp; Remesa; Num_Mensajes; Cola_Longitud"
  const reg = contador + ';' + newMsg + ';' + msgQueue.length + ";" + siguiente+";"+producedMessages;
  logMessage(logFilePathRemesa, reg, true);

  setTimeout(crearMensajes, siguiente);
}

