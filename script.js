// ============================================================
// CONFIGURACIÓN MQTT
// ============================================================
// Debe coincidir EXACTAMENTE con main.py.
const MQTT_BROKER = "broker.hivemq.com";
const MQTT_PORT = 8884;
const GRUPO = "salomon_esquiaqui";

const TOPIC_ESTADO = `clase/decoder/${GRUPO}/estado`;
const TOPIC_CONTROL = `clase/decoder/${GRUPO}/control`;
const TOPIC_STATUS = `clase/decoder/${GRUPO}/status`;

// ============================================================
// ESTADO REAL DEL ESP32 (heartbeat)
// ============================================================
// El ESP32 (main.py) publica "online" en TOPIC_STATUS cada 3s,
// y el broker publica "offline" solo si el ESP32 se desconecta
// de golpe (Last Will). Si no llega nada en este tiempo, se
// asume que Wokwi no está corriendo.
const HEARTBEAT_TIMEOUT_MS = 7000;
let ultimoHeartbeat = 0;
let esp32Conectado = false;

// Cliente WebSocket seguro de HiveMQ.
const client = new Paho.MQTT.Client(
  MQTT_BROKER,
  MQTT_PORT,
  `web_${GRUPO}_${Math.random().toString(16).slice(2)}`
);

const estado = document.getElementById("estado");
const displayBin = document.getElementById("display_bin");
const displayNum = document.getElementById("display_num");
const labelOrigen = document.getElementById("label_origen");
const binaryInput = document.getElementById("binaryInput");
const decimalInput = document.getElementById("decimalInput");
const toast = document.getElementById("toast");

const segmentos = {
  0: ["a","b","c","d","e","f"],
  1: ["b","c"],
  2: ["a","b","g","e","d"],
  3: ["a","b","c","d","g"],
  4: ["f","g","b","c"],
  5: ["a","f","g","c","d"],
  6: ["a","f","e","d","c","g"],
  7: ["a","b","c"],
  8: ["a","b","c","d","e","f","g"],
  9: ["a","b","c","d","f","g"]
};

function setDisplay(numero) {
  displayNum.textContent = numero;

  document.querySelectorAll(".seg").forEach(seg => {
    seg.classList.remove("on");
  });

  (segmentos[numero] || []).forEach(nombre => {
    const seg = document.querySelector(`.seg.${nombre}`);
    if (seg) seg.classList.add("on");
  });
}

// Estado visual unificado del indicador de arriba a la derecha.
// state: "online" (verde), "warning" (amarillo), "offline" (rojo)
function setStatus(text, state = "offline") {
  estado.classList.toggle("status-online", state === "online");
  estado.classList.toggle("status-warning", state === "warning");
  estado.classList.toggle("status-offline", state === "offline");
  estado.innerHTML = `<span class="status-dot"></span>${text}`;
}

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function renderBinary(bits, numero, origen) {
  binaryInput.textContent = bits;
  decimalInput.textContent = numero;
  displayBin.textContent = `Bits DIP: [ ${bits.split("").join(" ")} ]`;
  labelOrigen.textContent = `Origen: ${origen}`;

  bits.split("").forEach((bit, index) => {
    const sw = document.querySelector(`.virtual-switch[data-bit="${index}"]`);
    if (sw) sw.classList.toggle("active", bit === "1");
  });
}

let mqttConectado = false;

// ------------------------------------------------------------
// Estado unificado: combina "¿hay sesión MQTT?" con
// "¿el ESP32 sigue mandando heartbeat?" en UN solo indicador
// (arriba a la derecha).
// ------------------------------------------------------------
function actualizarEstadoGlobal() {
  if (!mqttConectado) {
    setStatus("Desconectado", "offline");
    return;
  }

  const heartbeatFresco =
    esp32Conectado && (Date.now() - ultimoHeartbeat) < HEARTBEAT_TIMEOUT_MS;

  if (heartbeatFresco) {
    setStatus("ESP32 en línea", "online");
  } else {
    setStatus("Wokwi sin responder", "warning");
  }
}

function conectar() {
  mqttConectado = false;
  setStatus("Conectando…", "warning");

  try {
    client.connect({
      useSSL: true,
      timeout: 8,
      // Si la conexión se corta después de haber conectado bien,
      // el propio cliente intenta reconectar solo (backoff automático).
      reconnect: true,
      keepAliveInterval: 20,
      cleanSession: true,
      onSuccess: () => {
        mqttConectado = true;
        client.subscribe(TOPIC_ESTADO);
        client.subscribe(TOPIC_STATUS);
        actualizarEstadoGlobal();
        showToast("MQTT conectado, esperando al ESP32…");
        console.log("Suscrito a:", TOPIC_ESTADO, "y", TOPIC_STATUS);
      },
      onFailure: (err) => {
        mqttConectado = false;
        actualizarEstadoGlobal();
        console.error("MQTT:", err);
        showToast("No se pudo conectar al broker");
      }
    });
  } catch (e) {
    // client.connect() puede lanzar si ya hay un intento en curso.
    console.warn("connect() ignorado (ya en curso):", e);
  }
}

client.onConnectionLost = response => {
  mqttConectado = false;
  esp32Conectado = false;
  actualizarEstadoGlobal();
  if (response.errorCode !== 0) {
    console.warn("Conexión perdida:", response.errorMessage);
  }
  // "reconnect: true" ya reintenta solo, pero por si acaso queda
  // atascado, el chequeo periódico de más abajo también reintenta.
};

function marcarEsp32Vivo() {
  ultimoHeartbeat = Date.now();
  esp32Conectado = true;
  actualizarEstadoGlobal();
}

client.onMessageArrived = message => {
  // ----------------------------------------------------------
  // Heartbeat / Last Will del ESP32
  // ----------------------------------------------------------
  if (message.destinationName === TOPIC_STATUS) {
    const payload = message.payloadString.trim().toLowerCase();

    if (payload === "offline") {
      esp32Conectado = false;
      actualizarEstadoGlobal();
    } else {
      marcarEsp32Vivo();
    }

    return;
  }

  try {
    const datos = message.payloadString.trim().split(",");
    if (datos.length !== 2) return;

    // Cualquier dato real del DIP también confirma que el
    // ESP32 está vivo.
    marcarEsp32Vivo();

    const [binario, decimalStr] = datos;

    if (!/^[01]{4}$/.test(binario)) return;

    const numero = Number(decimalStr);

    if (!Number.isInteger(numero) || numero < 0 || numero > 15) return;

    // El display decimal solamente acepta 0-9.
    if (numero <= 9) {
      setDisplay(numero);
    } else {
      // 10-15 son patrones binarios válidos, pero no dígitos
      // decimales del display. Se muestran los bits y se apaga
      // el display virtual.
      setDisplay(-1);
    }

    renderBinary(binario, numero, "DIP Wokwi");
    showToast(`DIP recibido: ${binario} = ${numero}`);
  } catch (e) {
    console.error("[onMessageArrived]", e);
  }
};

document.getElementById("btnComprobarConexion")
    .addEventListener("click", comprobarConexion);

function comprobarConexion() {

    const boton = document.getElementById("btnComprobarConexion");

    boton.disabled = true;
    boton.classList.add("spinning");

    if (!client.isConnected()) {

        console.log("MQTT desconectado, reconectando...");

        mqttConectado = false;
        esp32Conectado = false;
        actualizarEstadoGlobal();

        conectar();

        setTimeout(() => {
            boton.disabled = false;
            boton.classList.remove("spinning");
        }, 800);

        return;
    }

    // El estado real ya se actualiza solo con cada heartbeat
    // (ver marcarEsp32Vivo). Aquí solo refrescamos el indicador
    // por si el heartbeat ya venció.
    setTimeout(() => {
        actualizarEstadoGlobal();
        boton.disabled = false;
        boton.classList.remove("spinning");
    }, 500);
}

// Revisión automática cada 2s: si dejó de llegar heartbeat del
// ESP32 (por ejemplo, se detuvo la simulación en Wokwi), el
// indicador pasa solo a "Wokwi sin responder" sin tener que dar
// clic. También sirve de red de seguridad: si el propio MQTT del
// navegador quedó caído, reintenta conectar solo.
let reconectando = false;

setInterval(() => {
    if (esp32Conectado && (Date.now() - ultimoHeartbeat) > HEARTBEAT_TIMEOUT_MS) {
        esp32Conectado = false;
    }
    actualizarEstadoGlobal();

    if (!client.isConnected() && !reconectando) {
        reconectando = true;
        console.log("MQTT caído, reintentando conectar...");
        conectar();
        setTimeout(() => { reconectando = false; }, 5000);
    }
}, 2000);

// Cuando el navegador vuelve a tener foco/conexión (p. ej. se
// minimizó la pestaña un rato), se fuerza una verificación
// inmediata en vez de esperar hasta 2s, para "mantenerse
// enlazado" con Wokwi lo más rápido posible.
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !client.isConnected()) {
        conectar();
    }
});

window.addEventListener("online", () => {
    if (!client.isConnected()) conectar();
});

// ============================================================
// CONTROL WEB -> ESP32
// ============================================================
function enviarComando(numero) {
  if (!Number.isInteger(numero) || numero < 0 || numero > 9) return;

  if (!client.isConnected()) {
    showToast("MQTT no está conectado");
    return;
  }

  const msg = new Paho.MQTT.Message(String(numero));
  msg.destinationName = TOPIC_CONTROL;
  client.send(msg);

  // Respuesta visual inmediata del frontend.
  const bits = numero.toString(2).padStart(4, "0");
  setDisplay(numero);
  renderBinary(bits, numero, "Teclado web");

  showToast(`Enviado: ${numero} · ${bits}`);
}

// ============================================================
// TECLADO 0-9
// ============================================================
const teclado = document.getElementById("teclado");

for (let i = 0; i <= 9; i++) {
  const btn = document.createElement("button");
  btn.className = "key";
  btn.innerHTML = `${i}<span class="key-binary">${i.toString(2).padStart(4, "0")}</span>`;
  btn.addEventListener("click", () => enviarComando(i));
  teclado.appendChild(btn);
}

// Soporte para teclado físico.
document.addEventListener("keydown", e => {
  if (/^[0-9]$/.test(e.key)) {
    enviarComando(Number(e.key));
  }
});

// Inicializar display.
setDisplay(0);
renderBinary("0000", 0, "sistema");
conectar();


// =========================================================
// CONTROL REMOTO DEL DIP
// =========================================================

let dipUnlocked = false;

const lockButton = document.getElementById("lockButton");
const lockIcon = document.getElementById("lockIcon");
const lockStatus = document.getElementById("lockStatus");

const virtualSwitches =
    document.querySelectorAll(".virtual-switch");


// Estado inicial
function actualizarEstadoCandado() {

    if (dipUnlocked) {

        lockButton.classList.remove("locked");
        lockButton.classList.add("unlocked");

        lockStatus.textContent = "Control activo";
        lockStatus.classList.add("unlocked-status");

        lockButton.setAttribute(
            "aria-label",
            "Desactivar control de switches"
        );

        lockButton.setAttribute(
            "title",
            "Desactivar control de switches"
        );

        virtualSwitches.forEach(sw => {
            sw.classList.remove("locked");
            sw.classList.add("editable");
        });

    } else {

        lockButton.classList.remove("unlocked");
        lockButton.classList.add("locked");

        lockStatus.textContent = "Bloqueado";
        lockStatus.classList.remove("unlocked-status");

        lockButton.setAttribute(
            "aria-label",
            "Activar control de switches"
        );

        lockButton.setAttribute(
            "title",
            "Activar control de switches"
        );

        virtualSwitches.forEach(sw => {
            sw.classList.remove("editable");
            sw.classList.add("locked");
        });
    }
}


// =========================================================
// BOTÓN CANDADO
// =========================================================

lockButton.addEventListener("click", () => {

    dipUnlocked = !dipUnlocked;

    actualizarEstadoCandado();

});


// =========================================================
// OBTENER ESTADO ACTUAL DE LOS 4 SWITCHES
// =========================================================

function obtenerBitsVirtuales() {

    let bits = "";

    virtualSwitches.forEach(sw => {

        if (sw.classList.contains("active")) {
            bits += "1";
        } else {
            bits += "0";
        }

    });

    return bits;
}


// =========================================================
// CONVERTIR BINARIO A DECIMAL
// =========================================================

function binarioADecimal(bits) {

    return parseInt(bits, 2);
}


// =========================================================
// ACTUALIZAR LOS SWITCHES VISUALES
// =========================================================

function actualizarSwitches(bits) {

    if (!/^[01]{4}$/.test(bits)) {
        return;
    }

    virtualSwitches.forEach((sw, index) => {

        if (bits[index] === "1") {
            sw.classList.add("active");
        } else {
            sw.classList.remove("active");
        }

    });

}


// =========================================================
// CAMBIAR DISPLAY DESDE EL DIP VIRTUAL
// =========================================================

function cambiarDesdeDipVirtual() {

    const bits = obtenerBitsVirtuales();

    const numero = binarioADecimal(bits);

    // Actualizar switches
    actualizarSwitches(bits);

    // Actualizar información visual
    renderBinary(bits, numero, "control web");

    // Actualizar display de 7 segmentos
    if (numero >= 0 && numero <= 9) {
        setDisplay(numero);
    } else {
        setDisplay(-1);
    }

    // Enviar a Wokwi
    enviarPatronADispositivo(numero);

}


// =========================================================
// ENVIAR COMANDO AL ESP32
// -----------------------------------------------------------
// IMPORTANTE: main.py (al_recibir_del_frontend) solo entiende
// un número decimal en texto ("0".."9"), igual que el teclado.
// El DIP físico de Wokwi no se puede mover por software (son
// pines GPIO de entrada reales), así que estos switches virtuales
// funcionan como un atajo del teclado: si el patrón cae en 0-9 se
// envía ese número; 10-15 no tienen equivalente en el display y
// no se envían.
// =========================================================

function enviarPatronADispositivo(numero) {

    if (numero < 0 || numero > 9) {
        showToast("Ese patrón (10–15) no se puede enviar: el ESP32 solo acepta 0–9");
        return;
    }

    if (!client.isConnected()) {
        showToast("MQTT no está conectado");
        console.warn("MQTT no está conectado. No se pudo enviar:", numero);
        return;
    }

    const message = new Paho.MQTT.Message(String(numero));
    message.destinationName = TOPIC_CONTROL;
    client.send(message);

    showToast(`Enviado: ${numero} · ${numero.toString(2).padStart(4, "0")}`);

    console.log("Comando enviado a Wokwi desde el DIP virtual:", numero);
}


// =========================================================
// EVENTO DE CADA SWITCH
// =========================================================

virtualSwitches.forEach(sw => {

    sw.addEventListener("click", () => {

        // Si está bloqueado, no hacer nada
        if (!dipUnlocked) {
            return;
        }

        // Cambiar 0 ↔ 1
        sw.classList.toggle("active");

        // Procesar nuevo patrón
        cambiarDesdeDipVirtual();

    });

});


// Estado inicial
actualizarEstadoCandado();