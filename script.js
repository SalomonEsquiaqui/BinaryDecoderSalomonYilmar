// ============================================================
// CONFIGURACIÓN MQTT
// ============================================================
// Debe coincidir EXACTAMENTE con main.py.
const MQTT_BROKER = "broker.hivemq.com";
const MQTT_PORT = 8884;
const GRUPO = "salomon_esquiaqui";

const TOPIC_ESTADO = `clase/decoder/${GRUPO}/estado`;
const TOPIC_CONTROL = `clase/decoder/${GRUPO}/control`;

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

function setStatus(text, online = false) {
  estado.classList.toggle("status-online", online);
  estado.classList.toggle("status-offline", !online);
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
    if (sw) sw.classList.toggle("on", bit === "1");
  });
}

function conectar() {
  setStatus("Conectando…", false);

  client.connect({
    useSSL: true,
    timeout: 8,
    onSuccess: () => {
      setStatus("Conectado", true);
      client.subscribe(TOPIC_ESTADO);
      showToast("MQTT conectado");
      console.log("Suscrito a:", TOPIC_ESTADO);
    },
    onFailure: (err) => {
      setStatus("Error MQTT", false);
      console.error("MQTT:", err);
      showToast("No se pudo conectar al broker");
    }
  });
}

client.onConnectionLost = response => {
  setStatus("Desconectado", false);
  if (response.errorCode !== 0) {
    console.warn("Conexión perdida:", response.errorMessage);
  }
};

client.onMessageArrived = message => {
  try {
    const datos = message.payloadString.trim().split(",");
    if (datos.length !== 2) return;

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
    renderBinary(bits, numero, "control");

    // Actualizar display de 7 segmentos
    if (numero >= 0 && numero <= 9) {
        setDisplay(numero);
    } else {
        setDisplay(null);
    }

    // Enviar a Wokwi
    enviarPatronADispositivo(bits);

}


// =========================================================
// ENVIAR PATRÓN BINARIO A WOKWI
// =========================================================

function enviarPatronADispositivo(bits) {

    if (!client.isConnected()) {

        console.warn(
            "MQTT no está conectado. No se pudo enviar:",
            bits
        );

        return;
    }

    const message =
        new Paho.MQTT.Message(bits);

    message.destinationName =
        TOPIC_CONTROL;

    client.send(message);

    console.log(
        "DIP virtual enviado a Wokwi:",
        bits
    );
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