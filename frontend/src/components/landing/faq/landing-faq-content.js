export default [
  {
    id: 'origen',
    question: '¿De dónde viene Señor del Mictlán?',
    answer: 'De Etúcuaro, Michoacán. Su identidad está ligada al mezcal de agave cupreata.',
  },
  {
    id: 'agave',
    question: '¿Qué agave está presente?',
    answer: 'La referencia de marca es mezcal 100% agave cupreata.',
  },
  {
    id: 'presentacion-precio',
    question: '¿Dónde consulto precios y presentaciones?',
    answer: 'Cada botella es de 750 ml y su ficha muestra el precio base provisional. Confirmaremos las condiciones finales antes de habilitar la compra.',
  },
  {
    id: 'compra-presencial',
    question: '¿Puedo comprar los productos presencialmente?',
    answer: {
      prefix: 'Sí. Puedes comprar presencialmente en la ',
      linkLabel: 'Pulquería Templo Mayor',
      suffix: ' ubicada en Calle El Quelite #100, colonia Benito Juárez, Nezahualcóyotl, Estado de México.',
    },
    location: {
      mapEmbedUrl: 'https://maps.google.com/maps?cid=15961591364426347481&output=embed',
      facebookUrl: 'https://www.facebook.com/pulqueriatemplomayor/?locale=es_LA',
    },
  },
];
