//Clase para generar la heurística de las transacciones
/////////////////////////////////////////////////////////////////////////

class Heuristic  {
  
  constructor(){

    this.hash                   = '';
    this.inputs                 = Array();
    this.out                    = Array();

    this.numOutConCeros         = 0;
    this.numCeroOut             = Array();

    this.esOk                   = false;

    
  }//fin de construc



  //////////////////////////////////////////////////////////////////////////
  versionesDeTxs(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false;

    return this.esOk;

  }//fin de pagoUsandoTaproot



  //////////////////////////////////////////////////////////////////////////
  salidaMontoMayor(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false;

    
    //Inputs
    //Solos un inputs
    if (lengInputs != 1){
      return this.esOk;
    }
    //Solos dos out
    if (lengOut != 2){
      return this.esOk;
    }
    
  
    ///////////////////////////////////////
    //Tipo de direcciones iguales  
    //Si todas las direcciones (entradas y salidas) son del mismo tipo 
    var tipoDirecIni      = this.tipoDeDireccion(this.inputs[0].addresses[0]);
    if(tipoDirecIni == 'bc1'){
      tipoDirecIni        = this.tipoDirecBc1(this.inputs[0].addresses[0]);
    } //fin 

    //Recorremos out buscando los tipos de dirección distinta
    for(let i=0; i<lengInputs; i++) {
      if ( ( tipoDirecIni != this.tipoDeDireccion(this.inputs[i].addresses[0])) && 
           ( tipoDirecIni != this.tipoDirecBc1(this.inputs[i].addresses[0]))) {
            return this.esOk;
      }
    }//fin for(let i=0; i<lengInputs

    for(let i=0; i<lengOut; i++) {
      if ( ( tipoDirecIni != this.tipoDeDireccion(this.out[i].addresses[0])) && 
           ( tipoDirecIni != this.tipoDirecBc1(this.out[i].addresses[0]))) {
            return this.esOk;
      }
    }//fin for(let i=0; i<lengOut


    //Si los sats de una de las salidas es muy superior al otro, 
    //la dirección con el monte mas alto es la dirección de cambio.
    //Buscamos el maximo y el mínimo de sats de la salida
    var satsOut = Array();
    for(let i=0; i<lengOut; i++) {
      satsOut[i] = this.out[i].value; 
    }//fin for(let i=0; i<lengOut
    var satsOutMax = Math.max(...satsOut);
    var satsOutMin = Math.min(...satsOut);

    //El mínimo es mayor que el 10% del máximo
    if( satsOutMax * 0.1 < satsOutMin  ){
        return this.esOk;
    }

    this.esOk                   = true;
    return this.esOk;

  }//fin de salidaMontoMayor



  //////////////////////////////////////////////////////////////////////////
  entradaInnecesaria(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false;

    //Inputs

    //Solos dos inputs
    if (lengInputs != 2){
      return this.esOk;
    }

    ///////////////////////////////////////
    //Tipo de dirección del primer input 
    //Si todas las direcciones (entradas y salidas) son del mismo tipo 
    var tipoDirecIni      = this.tipoDeDireccion(this.inputs[0].addresses[0]);
    if(tipoDirecIni == 'bc1'){
      tipoDirecIni        = this.tipoDirecBc1(this.inputs[0].addresses[0]);
    } //fin 

    //Recorremos out buscando los tipos de dirección distinta
    for(let i=0; i<lengInputs; i++) {
      if ( ( tipoDirecIni != this.tipoDeDireccion(this.inputs[i].addresses[0])) && 
           ( tipoDirecIni != this.tipoDirecBc1(this.inputs[i].addresses[0]))) {
            return this.esOk;
      }
    }//fin for(let i=0; i<lengInputs

    for(let i=0; i<lengOut; i++) {
      if ( ( tipoDirecIni != this.tipoDeDireccion(this.out[i].addresses[0])) && 
           ( tipoDirecIni != this.tipoDirecBc1(this.out[i].addresses[0]))) {
            return this.esOk;
      }
    }//fin for(let i=0; i<lengOut


    //Si los sats de una de las salidas son inferiores a los sats de cualquiera de las entradas.
    //Buscamos el mínimo de sats de la salida
    var satsOut = Array();
    for(let i=0; i<lengOut; i++) {
      satsOut[i] = this.out[i].value; 
    }//fin for(let i=0; i<lengOut
    var satsOutMin = Math.min(...satsOut);
      
    for(let i=0; i<lengInputs; i++) {
      // if( this.inputs[i].prev_out.value < satsOutMin  ){
      if( this.inputs[i].addresses[0].value < satsOutMin  ){
        return this.esOk;
      }
    }//fin for(let i=0; i<lengIn


    this.esOk                   = true;

    return this.esOk;

  }//fin de entradaInnecesaria



  //////////////////////////////////////////////////////////////////////////
  pagoADirScripDif(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false;
  
    if(lengInputs == 1 && lengOut == 2){

      if ( ( this.tipoDirecBc1(this.inputs[0].addresses[0]) == 'bc1q')  &&
           ( this.tipoDirecBc1(this.out[0].addresses[0]) == 'bc1q')  &&
           ( this.tipoDirecBc1(this.out[1].addresses[0]) == 'bc1q') 
         ){

          var lenInput1 = (this.inputs[0].addresses[0]).length;
          var lenOut1   = (this.out[0].addresses[0]).length;
          var lenOut2   = (this.out[1].addresses[0]).length;


          if (!(lenInput1 == 62   || lenInput1  == 42 ||
                lenOut1   == 62   || lenOut1    == 42 ||
                lenOut2   == 62   || lenOut2    == 42) 
            ){
             console.log(this.hash);
             console.log('Transacción con longitud distinta de 42 ó 62');
          }//fin de if (!(lenInput1 == 62   || lenInput1  == 42 ||


          if ( ( lenInput1 == 62  ) &&   
               ( lenOut1   == 62    && lenOut2    == 42 ) ||
               ( lenOut1   == 42    && lenOut2    == 62  )
              ){
         
                this.esOk     = true;

          }//fin de if ( ( lenInput1 == 62  ) && 
         

      }//fin if ( this.tipoDirecBc1(this.inputs[i].inputs[i].addresses[0]) == 'bc1q'


    }// if(lengInputs == 1 && lengOut == 2)


    return this.esOk;

  }//fin de pagoADirScripDif



  //////////////////////////////////////////////////////////////////////////
  pagoUsandoTaproot(){

    var lengInputs         = this.inputs.length;
    var lengOut            = this.out.length;
    this.esOk              = false;

    //Inputs
    ///////////////////////////////////////
    //Tipo de dirección del input 
    var numDirecInpBc1q    = 0;
    var numDirecInpBc1p    = 0;

    //Recorremos out buscando los tipos de dirección distinta
    for(let i=0; i<lengInputs; i++) {

      if ( this.tipoDirecBc1(this.inputs[i].addresses[0]) == 'bc1q'){
        numDirecInpBc1q++;
      }//fin de  if ( this.tipoDirecBc1(this.inputs[i].addresses[0]) == 'bc1q')

      if ( this.tipoDirecBc1(this.inputs[i].addresses[0]) == 'bc1p'){
        numDirecInpBc1p++;
      }//fin de  if ( this.tipoDirecBc1(this.inputs[i].addresses[0]) == 'bc1p')

    }//fin for(let i=0; i<lengInputs

    //Out
    ///////////////////////////////////////
    //Tipo de dirección del out 
    var numDirecOutBc1q    = 0;
    var numDirecOutBc1p    = 0;

    //Recorremos out buscando los tipos de dirección distinta
    for(let i=0; i<lengOut; i++) {

      if ( this.tipoDirecBc1(this.out[i].addresses[0]) == 'bc1q'){
        numDirecOutBc1q++;
      }//fin de  if ( this.tipoDirecBc1 (this.out[i].addresses[0]) == 'bc1q'

      if ( this.tipoDirecBc1(this.out[i].addresses[0]) == 'bc1p'){
        numDirecOutBc1p++;
      }//fin de  if ( this.tipoDirecBc1 (this.out[i].addresses[0]) == 'bc1q'

    }//fin for(let i=0; i<lengOut


    //Si todas las inputs son bc1p y todas las out son bc1q menos una que es bc1p   
    if ( 
          numDirecInpBc1p == lengInputs   && 

          lengOut          > 1            &&
          numDirecOutBc1p == 1            &&
          numDirecOutBc1q == lengOut - 1  
       ){

           this.esOk     = true;
       
    }//fin de if ( numDirecInpBc1p == lengInputs   &

    return this.esOk;

  }//fin de pagoUsandoTaproot

  

  //////////////////////////////////////////////////////////////////////////
  pagoFormatoDiferente(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false; 

    //Inputs
    ///////////////////////////////////////
    //Tipo de dirección del primer input 
    var tipoDirecInputs         = this.tipoDeDireccion(this.inputs[0].addresses[0]);
    var distintosTiposDireccion = false;

    //Recorremos inputs buscando si hay algun inputs 
    for(let i=0; i<lengInputs; i++) {
      
      if ( tipoDirecInputs      != this.tipoDeDireccion(this.inputs[i].addresses[0])){

        distintosTiposDireccion  = true;

      }//fin de if ( tipoDirecInputs != tipoDeireccion(this.inp

    }//fin for(let i=0; i<lengInput

    //Si encontramos un tipo de dirección distinto en la entrada damos la Tx por noOK
    if(distintosTiposDireccion){
      this.esOk     = false;
      return this.esOk;

    }else{  
      //Si coinciden todos los tipos de dirección de los inputs
      tipoDirecInputs            = this.tipoDeDireccion(this.inputs[0].addresses[0]);

    }//fin de if(distintosTiposDireccion


    //Out
    ///////////////////////////////////////
    //Tipo de dirección del primer out 
    // var tipoDirecOut             = this.tipoDeDireccion(this.out[0].addr);
    this.esOk                    = false;
    var numeroDireccDistintas    = 0;

    //Recorremos out buscando los tipos de dirección distinta
    for(let i=0; i<lengOut; i++) {

      if ( tipoDirecInputs      != this.tipoDeDireccion(this.out[i].addresses[0])){

        numeroDireccDistintas++;

      }//fin de if ( tipoDirecInputs != tipoDeireccion(this.inp

      
    }//fin for(let i=0; i<lengOut

    //Si solamente hay 1 tipo de dirección distinta la Tx es OK
    if ((numeroDireccDistintas == 1 &&
         lengOut > 1)){

            this.esOk     = true;
            return this.esOk;
       
    }//fin de if if (numeroDireccDistintas == 1)

    return this.esOk;

  }//fin de pagoFormatoDiferente



  //////////////////////////////////////////////////////////////////////////
  pagoNumeroRedondo(){

    var lengOut                 = this.out.length;
    this.numOutConCeros         = 0;
    this.esOk                   = false;

    for(let i=0; i<lengOut; i++) {

      var numCero = this.numeroCeros(this.out[i].value);
      this.numCeroOut[i]          = numCero;

      //Si tiene mas de 3 ceros 
      if(numCero >= 3){
        this.numOutConCeros++;
      }
    
    }// fin de for (let i=0; i<=lenOut; i++ 
    
    //Analiza salidas de la Tx con mas de 3 ceros
    if (( (lengOut == 1 ) && ( this.numOutConCeros == 1 ) )||
          (lengOut >  1 ) && ( this.numOutConCeros >= lengOut - 1 )){

      this.esOk = true;

    }

    return this.esOk;

  }// fin de pagoNumeroRedondo



  //////////////////////////////////////////////////////////////////////////
  reutilizaDirecciones(){

    var lengInputs              = this.inputs.length;
    var lengOut                 = this.out.length;
    this.esOk                   = false;

    if(lengInputs == 1 && lengOut == 2){
      
        if ( this.inputs[0].addresses[0] && 
            (
              this.inputs[0].addresses[0] == this.out[0].addresses[0] ||
              this.inputs[0].addresses[0] == this.out[1].addresses[0]
            )
           ){
          
          this.esOk = true;
          
        }// fin de if (inputs[0].prev_
        
    }//fin de if(lengInputs == 1 && lengOut

    return this.esOk;

  }// fin de async reutilizaDirecciones



  //////////////////////////////////////////////////////////////////////////
  //Métodos privados
  //////////////////////////////////////////////////////////////////////////
  numeroCeros (numero){

    var numCeros = 0;

    if(       (numero%100000000) == 0 ){
      numCeros = 8;
    }else if( (numero%10000000) == 0 ){
      numCeros = 7;
    }else if( (numero%1000000) == 0 ){
      numCeros = 6;
    }else if( (numero%100000) == 0 ){
      numCeros = 5;
    }else if( (numero%10000) == 0 ){
      numCeros = 4;
    }else if( (numero%1000) == 0 ){
      numCeros = 3;
    }else if( (numero%100) == 0 ){
      numCeros = 2;
    }else if( (numero%10) == 0 ){
      numCeros = 1;

    }//fin if(       (numero%100000

    return numCeros;

  }//fin numeroCeros (numero



  tipoDeDireccion (addr){

    var tipoDirec = 0;
    if(!addr) return tipoDirec;

    if ( addr.substring(0,1) == '1' ){
      tipoDirec = 1;
    }else if ( addr.substring(0,1) == '3' ){
      tipoDirec = 2;
    }else if ( addr.substring(0,3) == 'bc1' ){
      tipoDirec = 3;

    }//fin de if if ( addr.substring(0,1) == 

    return tipoDirec;

  }//fin tipoDeireccion (addr



  tipoDirecBc1 (addr){

    var tipoDirec = 0;
    if(!addr) return tipoDirec;

    if ( addr.substring(0,4) == 'bc1q' ){
      tipoDirec = 'bc1q';
    }else if ( addr.substring(0,4) == 'bc1p' ){
      tipoDirec = 'bc1p';

    }//fin de  if ( addr.substring(0,4) == 'bc1q' 

    return tipoDirec;

  }//fin tipoDirecBc1 (addr){


  
}// fin de class Heuristic




////  inputs[0 o i ].prev_out.addr  ===>  inputs[0 o i].addresses[0]   
////  out[i].addr   ===> out[i].addresses[0]  