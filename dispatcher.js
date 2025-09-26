/***
 * Variables para la conexión al classifier
 */
const axios = require('axios');
const { response } = require('express');
const ENDPOINT_URL = 'http://localhost:3100/classifier/getmsg';


/******
 * Variables del dispatcher para controlar su cola priorizada
 */

const sortQueu = [];
const maxSortQueu = 5000; // número de colas priorizadas
const numMessages = 1000; // número de mensajes a solicitar al classifier
const porwerPriority = [];  // establecer el valor de potencia de cada cola de prioridad
const msgPerPriority = []; // mensajes por cada cola de prioridad
const maxPriority = 4;

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

async function launch() {
    const data = await getClassifierMessage(10, 1);
    console.log("\nDatos recibidos del classifier:");
    console.log(data);
}


setInterval(launch, 1000);

