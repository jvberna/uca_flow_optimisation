# uca_flow_optimisation

Simulación del sistema de colas con priorización. El sistema consta de tres componentes:
- IoT_broker: simula un broker de mensajes generados de un entorno IoT. Se generan por remesas, y el número de mensajes que ne cada remesa se genera es aleatorio. Las remesas tambilén se generan en periodos aleatorios.
- Classifier: recibe todos los mensajes emitidos por el broker, los captura en bach de X mensajes cada Y segundos, y los distribuye entre varias colas atendiendo a la prioridad de cada mensaje. Mantiene actualizadas las colas de forma que cada cola tiene configurada un antigüedad máxima de mensaje y cuand un mensaje expira, lo envía a una cola de "mensajes expirados".
- Dispatcher: se alimenta de las colas de mensajes del clasificador de forma que, dada una potencia total de procesamiento equivalente a un número total de mensajes por segundo que se pueden procesar, el dispatcher calcula cuantos mensajes puede procesar de cada cola de prioridad, asignando a cada cola el doble de mensajes a procesar que la inferior, para dar más prioridad de procesamiento a las colas de más prioridad. Si cuando consulta una cola hay mensos mensajes de los que puede procesar, esta capacidad remanente la pasa a la siguiente cola. De forma que solo si ha sobrado potencia, se procesarán mensajes de la cola de expirados.

Los mensajes generados desde el IoT broker y que serán ordenados en la cola final tienen el siguiente formato:
    {
        remesa: un contador 1, 2, 3...,
        id: remesa + contador interno de remesa, genera un id único para cada mensaje
        priority: un número al random entre máximo y mínimo
        timestamp: milisegundos desde las 00:00 de 1070
    }

## Instalación

npm i

# IoT_broker

Es un simulador de broquer de mensajes, se pueden configurar min/max mensajes por remesa, tiempo entre remesas, min/max prioridad en los mensajes

## Ejecutar

node ./iot_broker

## Endpoints del broker

* Recuperar mensajes:
Invocar el endpoint: http://localhost:3000/iot_broker/getmsg?num=123
- El parámetro num indica cuantos mensajes queremos obtener del broker. Enviará haste este número si hay en la cola.

# classifier

Obtiene mensajes de una cola de mensajes y los distribuye entre varias colas de prioridad, en función de la prioridad que tenga el mensaje (campo priority interno).
Además revisa si hay mensajes expirados dentro de la cola, y si expiran los mueve a una cola espcial.

## Ejecutar

node ./classifier

## Endpoints del classifier

* Recuperar mensajes
Invocar el endpoint: http://localhost:3100/classifier/getmsg?num=123&priority=1
- El parámetro num indica cuantos mensajes queremos obtener de una cola en concreto.
- Priority indica la cola de la queremos obtener mensajes, puede ser un número entre 1 y la máxima prioridad, o 0 para obtener de la cola de expirados.

## Dispatcher

Obtiene mensajes del classifier, ordenándolos en una cola priorizada final y ponderada que pemitirá procesarlos por prioridad, potencia y por atigüedad.


# Ejecutar

node ./dispatcher

## Endpoints del dispatcher

* Recuperar mensajes
Invocar el endpoint: http://localhost:3200//dispatcher/getmsg?num=123
- El parámetro num indica cuantos mensajes queremos obtener de una cola en concreto.
