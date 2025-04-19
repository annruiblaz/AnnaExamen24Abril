/* ------ General ------ */
const radioIA = document.getElementById('ia');
const radioAnalitica = document.getElementById('analitica');

/* ------ MQTT ------ */

//**Definicion d constantes + crear cliente MQTT
//definimos la dirección del broker mqtt
const mqttHost = 'io.adafruit.com';
//puerto para conexiones seguras x websockets
const mqttPort = 443;
//user d adafruit y clave d acceso
const mqttUser = 'anna_dev';
const mqttKey = '';
//topico mqtt x el q se envian y reciben los msj
const mqttTopic = `${mqttUser}/feeds/examenServo`;

console.log(radioIA);
//creamos el cliente MQTT usando websockets
const client = mqtt.connect(`wss://${mqttHost}:${mqttPort}`, {
    username: mqttUser,
    password: mqttKey,
});

//**Eventos del cliente MQTT
//cuando establece conexión con el broker
client.on('connect', () => {
    //printeamos
    console.log('Conectado a MQTT');

    //se suscribe al topico para recibir los msj con la info
    client.subscribe(mqttTopic, (err) => {
        if(!err) console.log(`Suscrito en el tópico: ${mqttTopic} con éxito!`);
            else console.error(`Se ha producido un error al suscribirse en el tópico ${mqttTopic}: ${err}`);
    });
});

//cuando recibe un msj MQTT en el topico
client.on('message', (topic, message) => {
    console.log(`Mensaje recibido en ${topic}: ${message.toString()}`);
});

//en caso d algun error (conexion o msj)
client.on('error', (err) => {
    console.error('Error durante MQTT: ', err);
});

//**funciones varias
//envia un msj con MQTT
function sendMessage() {
    let modoSeleccionado = radioIA.checked ? radioIA.value : radioAnalitica.value;

    //TODO: obtener solucion segun modo


    let message = {
        theta1: 'theta1',
        theta2: 'theta2',
        modo: modoSeleccionado
    };

    //TODO: enviar msj al topico
}

/* ------ Inverse Kinematics ------ */

// Parámetros globales
let l1 = 100,
    l2 = 100; // Longitudes de los eslabones
let datosEntrenamiento = []; // Array de {x, y, theta1, theta2} en escala real
let modelo; // Nuestro modelo TFJS
const learningRate = 0.003; // Ajusta esta tasa de aprendizaje según convenga

// Función para convertir de radianes a grados y viceversa
function grados(radianes) {
    return (radianes * 180) / Math.PI;
}

function radianes(grados) {
    return (grados * Math.PI) / 180;
}

// Función analítica de cinemática inversa que elige la solución con codo a la derecha.
// Se calculan ambas posibles soluciones y se selecciona aquella cuyo codo (posición del primer eslabón) tenga mayor valor en x.
function ikAnalitico(x, y) {
    let r2 = x * x + y * y;
    let D = (r2 - l1 * l1 - l2 * l2) / (2 * l1 * l2);
    if (Math.abs(D) > 1) return null; // Punto fuera del alcance.
    let theta2a = grados(Math.atan2(Math.sqrt(1 - D * D), D));
    let theta2b = grados(Math.atan2(-Math.sqrt(1 - D * D), D));
    let theta1a =
        grados(Math.atan2(y, x)) -
        grados(
            Math.atan2(
                l2 * Math.sin(radianes(theta2a)),
                l1 + l2 * Math.cos(radianes(theta2a))
            )
        );
    let theta1b =
        grados(Math.atan2(y, x)) -
        grados(
            Math.atan2(
                l2 * Math.sin(radianes(theta2b)),
                l1 + l2 * Math.cos(radianes(theta2b))
            )
        );
    // Calcular posición del codo para cada solución
    let codoA_x = l1 * Math.cos(radianes(theta1a));
    let codoB_x = l1 * Math.cos(radianes(theta1b));
    // Escoger la solución con mayor valor de codo en x (preferencia al codo derecho)
    if (codoA_x >= codoB_x) {
        return {
            theta1: theta1a,
            theta2: theta2a,
        };
    } else {
        return {
            theta1: theta1b,
            theta2: theta2b,
        };
    }
}

// Genera el dataset de entrenamiento.
// Se recorren ángulos φ (0 a 360°) y radios r (0 a l1+l2) para cubrir todo el círculo alcanzable.
function generarDatosEntrenamiento() {
    datosEntrenamiento = [];
    for (let phi = 0; phi < 360; phi += 10) {
        // 36 pasos en φ
        for (let r = 0; r <= l1 + l2; r += 10) {
            let x = r * Math.cos(radianes(phi));
            let y = r * Math.sin(radianes(phi));
            let solucion = ikAnalitico(x, y);
            if (solucion) {
                datosEntrenamiento.push({
                    x: x,
                    y: y,
                    theta1: solucion.theta1,
                    theta2: solucion.theta2,
                });
            }
        }
    }
}

// Entrenar el modelo usando el dataset generado.
async function entrenarModelo() {
    generarDatosEntrenamiento();
    let entradas = [];
    let salidas = [];
    // Normalizamos: x e y se dividen entre (l1+l2)=200; los ángulos se dividen entre 180 para quedar en [-1,1]
    for (let i = 0; i < datosEntrenamiento.length; i++) {
        let d = datosEntrenamiento[i];
        entradas.push([d.x / (l1 + l2), d.y / (l1 + l2)]);
        salidas.push([d.theta1 / 180, d.theta2 / 180]);
    }
    const tensorEntradas = tf.tensor2d(entradas);
    const tensorSalidas = tf.tensor2d(salidas);

    modelo = tf.sequential();
    modelo.add(
        tf.layers.dense({
            units: 64,
            inputShape: [2],
            activation: "relu",
        })
    );
    modelo.add(
        tf.layers.dense({
            units: 64,
            activation: "relu",
        })
    );
    modelo.add(
        tf.layers.dense({
            units: 2,
        })
    ); // Predice theta1 y theta2

    // Se utiliza el optimizador Adam con la tasa de aprendizaje definida
    modelo.compile({
        optimizer: tf.train.adam(learningRate),
        loss: "meanSquaredError",
    });

    await modelo.fit(tensorEntradas, tensorSalidas, {
        epochs: 100,
        shuffle: true,
        callbacks: {
            onEpochEnd: (epoca, datos) => {
                console.log(`Época ${epoca}: pérdida = ${datos.loss}`);
            },
        },
    });
    console.log("Entrenamiento finalizado");
}

// --- Sketch de simulación del brazo (Canvas de la izquierda) ---
let sketchSimulacion = function (p) {
    let objetivo = null; // Punto objetivo (Vector p5)
    let angulosPredichos = [0, 0]; // Ángulos predichos por la red (en grados)

    p.setup = function () {
        let canvas = p.createCanvas(400, 400);
        canvas.parent("simulacion");
        p.angleMode(p.DEGREES);
    };

    p.draw = function () {
        p.background(240);
        p.translate(p.width / 2, p.height / 2);

        // Dibujar la circunferencia máxima alcanzable en rojo
        p.stroke(255, 0, 0);
        p.noFill();
        p.strokeWeight(2);
        p.circle(0, 0, 2 * (l1 + l2)); // Diámetro = 2*(l1+l2)

        // Si hay un objetivo y el modelo está entrenado, predecir los ángulos y obtener solución analítica
        let solucionAnalitica = null;
        if (objetivo && modelo) {
            predecirAngulos(objetivo.x, objetivo.y);
            solucionAnalitica = ikAnalitico(objetivo.x, objetivo.y);
        }

        // --- Brazo predicho por la red (color negro) ---
        let theta1 = angulosPredichos[0];
        let theta2 = angulosPredichos[1];
        let x1 = l1 * p.cos(theta1);
        let y1 = l1 * p.sin(theta1);
        let x2 = x1 + l2 * p.cos(theta1 + theta2);
        let y2 = y1 + l2 * p.sin(theta1 + theta2);

        p.stroke(0);
        p.strokeWeight(8);
        p.line(0, 0, x1, y1);
        p.line(x1, y1, x2, y2);
        p.fill(255, 0, 0);
        p.circle(x2, y2, 12);

        // --- Brazo calculado analíticamente (para comparar) ---
        if (solucionAnalitica) {
            let theta1a = solucionAnalitica.theta1;
            let theta2a = solucionAnalitica.theta2;
            let x1a = l1 * p.cos(theta1a);
            let y1a = l1 * p.sin(theta1a);
            let x2a = x1a + l2 * p.cos(theta1a + theta2a);
            let y2a = y1a + l2 * p.sin(theta1a + theta2a);
            // Se dibuja con un trazo más delgado y color verde para diferenciar
            p.stroke(0, 150, 0);
            p.strokeWeight(4);
            p.line(0, 0, x1a, y1a);
            p.line(x1a, y1a, x2a, y2a);
            p.fill(150, 0, 150);
            p.circle(x2a, y2a, 12);
        }

        // Dibujar objetivo
        if (objetivo) {
            p.fill(0, 0, 255);
            p.noStroke();
            p.circle(objetivo.x, objetivo.y, 10);
        }

        // Mostrar información de la predicción
        p.fill(0);
        p.noStroke();
        p.textSize(14);
        p.text(
            `Theta1 (IA): ${theta1.toFixed(1)}°`,
            -p.width / 2 + 10,
            -p.height / 2 + 20
        );
        p.text(
            `Theta2 (IA): ${theta2.toFixed(1)}°`,
            -p.width / 2 + 10,
            -p.height / 2 + 40
        );

        // Función interna para predecir ángulos con la red
        function predecirAngulos(x, y) {
            let entrada = tf.tensor2d([
                [x / (l1 + l2), y / (l1 + l2)]
            ]);
            let salida = modelo.predict(entrada);
            let datos = salida.dataSync();
            angulosPredichos[0] = datos[0] * 180;
            angulosPredichos[1] = datos[1] * 180;
        }
    };

    p.mousePressed = function () {
        // Establecer objetivo en función del clic (convertido a coordenadas relativas al centro)
        objetivo = p.createVector(p.mouseX - p.width / 2, p.mouseY - p.height / 2);
    };
};

// --- Sketch para visualizar el dataset (Canvas de la derecha) ---
let sketchDatos = function (p) {
    p.setup = function () {
        let canvas = p.createCanvas(400, 400);
        canvas.parent("datos");
        p.angleMode(p.DEGREES);
    };

    p.draw = function () {
        p.background(240);
        p.translate(p.width / 2, p.height / 2);
        // Dibujar la circunferencia máxima alcanzable (en rojo)
        p.stroke(255, 0, 0);
        p.noFill();
        p.strokeWeight(2);
        p.circle(0, 0, 2 * (l1 + l2)); // Diámetro = 2*(l1+l2)

        // Dibujar todos los puntos de entrenamiento (en negro)
        p.stroke(0);
        p.fill(0);
        for (let i = 0; i < datosEntrenamiento.length; i++) {
            let d = datosEntrenamiento[i];
            p.circle(d.x, d.y, 2);
        }
    };
};

// Crear instancias de p5 para cada canvas
new p5(sketchSimulacion);
new p5(sketchDatos);

// Iniciar el entrenamiento del modelo
entrenarModelo();
