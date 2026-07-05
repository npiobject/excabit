
class Bchain  {

    constructor()                                           {
        this.idTx   = 0;   //Tx de estudio

    }//fin constructor

    ////////////////////////////////////////////////////////////////////////////////////////
    //Métodos Principales
    ////////////////////////////////////////////////////////////////////////////////////////
    putTxInicial(idTxTra)                                   {

        //Agregamos Tx original centrada en el canvas
    
        posiTxs.push({    
                        'idTx'          : idTxTra , 
                        'x'             : int(myCanvas.dimCanvas.xCentro - (anchoTx/2)),    
                        'y'             : int(myCanvas.dimCanvas.yCentro - (altoTx /2)), 
                        'xCentro'       : int(myCanvas.dimCanvas.xCentro),    
                        'yCentro'       : int(myCanvas.dimCanvas.yCentro), 
                        'weight'        : 2,
                        'io'            : 'X'  ,    
                        'tagTx'         : '',     
                        'estado'        : "calculado",
                        'color'         : {'r':77,  'g':77,  'b':77},
                        'bgColor'       : {'r':127, 'g':127, 'b':127},
                        'movido'        : false,
                        'blockHeight'   : 0,
                        'value'         : 0,
                        'numVin'        : 0,
                        'numVout'       : 0,
                        'blockTime'     : 0,
                        'fees'          : 0,
                        'multiTxs'      : [],
                        'version'       : 0,
                        'lockTime'      : 0,
                        'heuristic'     : [],
                        // 'esUtxo'        : false,
                        
                    });     
                    
        txOrigen = posiTxs;    
        
        //Ponemos semaforo a verde para traer mas datos de Txs y Addrs
        estadoDatosTxAddrNN = true;
    
    }//fin putTxInicial()    

    async getDatosTxAddrNN()                                {
        //Get datos de Tx antes de hacer doubleClick
        //Recogemos datos de Now Nodes en segundo plano

        let resUnaTx, idTx, yaEstaBajado ;

        for(let i=0; i<posiTxs.length; i++) {

            idTx = posiTxs[i].idTx;

            if((idTx).substring(0,5) == 'Multi'){
                 continue;
            }//fin if((idTx).substring(0,4) == 'Multi

            yaEstaBajado = false;

            if(datosTxNN.length == 0) yaEstaBajado = false;

            for(let j=0; j<datosTxNN.length; j++) {

                if( datosTxNN[j].idTx == idTx ){
                    yaEstaBajado = true;
                    continue;
                }//fin if( datosTxNN[j].idTx == idTx 

 
            }//fin for(let j=0; j<datosTxNN.length; j++)

            if(!yaEstaBajado){

                resUnaTx = await myConex.getTxNN ( idTx );

                posiTxs[i].blockHeight      = resUnaTx.blockHeight;
                posiTxs[i].value            = resUnaTx.value;
                posiTxs[i].numVin           = (resUnaTx.vin).length;
                posiTxs[i].numVout          = (resUnaTx.vout).length;
                posiTxs[i].blockTime        = resUnaTx.blockTime;
                posiTxs[i].fees             = resUnaTx.fees;   
                posiTxs[i].version          = resUnaTx.version;
                posiTxs[i].lockTime         = resUnaTx.lockTime;

                posiTxs[i].heuristic        = this.getHeuristic(resUnaTx.vin, resUnaTx.vout);

                ////////// ¿Es un UTXO?
                ////////// if(posiTxs[i].numVout == 0){
                //////////     posiTxs[i].esUtxo = true;
                ////////// }//fin if(posiTxs[i].numVout == 0)

                divGifAnimado.hide();

            }//fin if(!yaEstaBajado

        }//fin for(let i=0; i<posiTxs.length; i++)


        myBchain.dibujaTxsAddrs();


    }//fin getDatosTxAddrNN
    

    async getDatos( idTxTra , index )                       {
        
        let resUnaTx, resUnaAddr;
        let idAddr, idTxsOut, numTxsMulti; 
        let tipoTx = '1a1';
        let arrMultiTxs;
        let esUnUTXO = false;

        //Get en servidor datos de una Tx
        resUnaTx        = await myConex.getTxNN ( idTxTra );

// console.log(resUnaTx);
            
        if (resUnaTx.error){
            alert( 'Error en: ' + resUnaTx.error );
            return;
        }


        //Recoge datos de la Tx para grabar en posiTxs
        posiTxs[index].blockHeight      = resUnaTx.blockHeight;
        posiTxs[index].value            = resUnaTx.value;
        posiTxs[index].numVin           = (resUnaTx.vin).length;
        posiTxs[index].numVout          = (resUnaTx.vout).length;
        posiTxs[index].blockTime        = resUnaTx.blockTime;
        posiTxs[index].fees             = resUnaTx.fees;
        posiTxs[index].version          = resUnaTx.version;
        posiTxs[index].lockTime         = resUnaTx.lockTime;

        posiTxs[index].heuristic        = this.getHeuristic(resUnaTx.vin, resUnaTx.vout);
                

        //Se añaden (push) de resUnaTx en arbolTxsAddrs, posiTxs y posiAddrs siempre que no existan
        // separando el proceso de entradas del de salidas 
        // se ponen en estado = calculado y movido = false
        // Se crea multiTxs para el caso de tipo = 1aN un addr con un origen y N destinos
        ///////////////////////////////////////////////////////////////////////////////

        //INPUTS
        for(let i=0; i<resUnaTx.vin.length; i++) {

            //Si no es una direccion la saltamos
            if(!resUnaTx.vin[i].isAddress){
                continue;
            }//fin if(!resUnaTx.vin.isAddress

            //arbolTxsAddrs
            ///////////////
            tipoTx = '1a1';
            if (!this.#isInArbolTxsAddrs ( idTxTra, resUnaTx.vin[i].addresses[0] , resUnaTx.vin[i].txid )){
                arbolTxsAddrs.push({
                                        'io'        : 'I' ,
                                        'tipo'      : tipoTx,
                                        'rama'      : [ idTxTra, 
                                                        resUnaTx.vin[i].addresses[0] , 
                                                        resUnaTx.vin[i].txid ] ,
                                        'angulo'    : 0 ,     
                                        'distancia' : 0 ,
                                    });

            }//fin if (!this.#isInArbolTxsAddrs ( idTxTra, resUnaTx.vin[i].addresses[0] 

            //posiTxs
            ///////////////
            if ( !this.#isInPosiTxs (  idTxTra ) ){
                posiTxs.push({    
                                'idTx'          : idTxTra , 
                                'io'            : 'I'  ,    
                                'tagTx'         : '',     
                                'estado'        : 'calculado',
                                'movido'        : false,
                                'color'         : {'r':77,  'g':77,  'b':77},
                                'bgColor'       : {'r':127, 'g':127, 'b':127},
                                'weight'        : 2,
                                'blockHeight'   : 0,
                                'value'         : 0,
                                'numVin'        : 0,
                                'numVout'       : 0,
                                'blockTime'     : 0,
                                'fees'          : 0,
                                'multiTxs'      : [],
                                'version'       : 0,
                                'lockTime'      : 0,
                                'heuristic'     : [],
                                // 'esUtxo'        : false,
                            });
                            
            }//fin if ( !this.buscaPosiTxs ( idTxTra ) 

            if ( !this.#isInPosiTxs (   resUnaTx.vin[i].txid ) ){
                let a=1;
                posiTxs.push({    
                                'idTx'          : resUnaTx.vin[i].txid , 
                                'io'            : 'I'  ,    
                                'tagTx'         : '',  
                                'estado'        : 'calculado',   
                                'movido'        : false,
                                'color'         : {'r':77,  'g':77,  'b':77},
                                'bgColor'       : {'r':127, 'g':127, 'b':127},
                                'weight'        : 2,
                                'blockHeight'   : 0,
                                'value'         : 0,
                                'numVin'        : 0,
                                'numVout'       : 0,
                                'blockTime'     : 0,
                                'fees'          : 0,
                                'multiTxs'      : [],
                                'version'       : 0,
                                'lockTime'      : 0,
                                'heuristic'     : [],
                                // 'esUtxo'        : false,
                            });        
                        
            }//fin if ( !this.buscaPosiTxs (   idTxTra ) 

            //posiAddrs
            ///////////////
            if (!this.#isInPosiAddrs(resUnaTx.vin[i].addresses[0], idTxTra , resUnaTx.vin[i].txid )){
                posiAddrs.push({
                                    'idAddr'    : resUnaTx.vin[i].addresses[0], 
                                    'io'        : 'I'  , 
                                    'idTx1'     : idTxTra ,  
                                    'idTx2'     : resUnaTx.vin[i].txid ,
                                    'tagAddr'   : '', 
                                    'estado'    : 'calculado',
                                    'x1'        : 0,         
                                    'y1'        : 0,  
                                    'x2'        : 0,         
                                    'y2'        : 0, 
                                    'angulo'    : 0,         
                                    'distancia' : 0,
                                    'ancho'     : 7,        
                                    'color'     : {'r':77,  'g':77,  'b':77}, 
                                    'bgColor'   : {'r':127, 'g':127, 'b':127},
                                    'movido'    : false,
                                    'value'     : resUnaTx.vin[i].value,
                                    'esUtxo'    : false,
                                }); 

            }//fin   if (!#isInPosiAddrs(resUnaTx.vin[i].addresses[0], idTxTra , resUnaTx.vin[i                   

        }//fin for(let i=0; i<resUnaTx.vin.length; i++)


        //OUTPUTS   -   Puede ser un UTXO
        for(let i=0; i<resUnaTx.vout.length; i++) {

            idAddr          = resUnaTx.vout[i].addresses[0];

            //Saltamos los OP_RETURN
            if (idAddr.substring(0, 9) === 'OP_RETURN'){
                continue;
            }//fin 

            //Get en servidor datos de una Addr
            resUnaAddr      = await myConex.getAddrNN ( idAddr );

            // esUnUTXO = await datosAddrNN.datosUtxo;
            // console.log(esUnUTXO);

// console.log(resUnaAddr);


            // ¿Es un UTXO? => todos los Addrs son UTXO
            // Si totalSent == 0  ===> Es UTXO
            // Si totalReceived > totalSent  ===> ¿Es UTXO?
            if((resUnaAddr.totalSent == 0) ||
               (resUnaAddr.totalReceived > resUnaAddr.totalSent)){
                esUnUTXO = true;
            }else{
                esUnUTXO = false;
            }//fin if(posiTxs[i].numVout == 0)
                
            //Array con los txs de una Addr 1aN
            //Solamente los 10 primeros
            //arrMultiTxs     = (resUnaAddr.txids).slice(0, 9);
            arrMultiTxs     = (resUnaAddr.txids);
        
            for(let j=0; j<resUnaAddr.txids.length; j++) {


                if (resUnaAddr.txids[j] != idTxTra){
                    
                    //arbolTxsAddrs y multiTxs
                    //////////////////////////
                    
                    //tratamos los txids con 2 y mas de 2
                    idTxsOut        = resUnaAddr.txids[j];
                    tipoTx          = '1a1';
                    if(resUnaAddr.txs > 2){    //Con mas de 2 llamamos Multi Txs
                        numTxsMulti = int((resUnaAddr.txids).length)-1;
                        idTxsOut    = 'Multi Txs: ' + numTxsMulti + ' - ' + resUnaAddr.totalSent;
                        tipoTx      = '1aN';
                        
                    }//fin if(resUnaAddr.txs > 2)

                    if (!this.#isInArbolTxsAddrs ( idTxTra, idAddr ,  idTxsOut )){
                        arbolTxsAddrs.push({
                                                'io'        : 'O' ,
                                                'tipo'      : tipoTx,
                                                'rama'      : [ idTxTra, 
                                                                idAddr , 
                                                                idTxsOut ] ,
                                                'angulo'    : 0 ,     
                                                'distancia' : 0 ,
                                            });
                        
                    }//fin if (!this.#isInArbolTxsAddrs ( idTxTra, idAddr , 

                    if(resUnaAddr.txs > 2){    //Con mas de 2 Añadimos a multiTxs 
                        multiTxs.push({
                                        'id'        : arbolTxsAddrs.length - 1,
                                        'io'        : 'O' ,
                                        'rama'      : [ idTxTra, 
                                                        idAddr ,    
                                                        resUnaAddr.txids[j] ] 
                                      });

                    }//fin if(resUnaAddr.txs > 2)

                    //posiTxs
                    ///////////
                    if ( !this.#isInPosiTxs (  idTxTra )){
                        posiTxs.push({    
                                                'idTx'          : idTxTra ,  
                                                'io'            : 'O'  ,   
                                                'tagTx'         : '',   
                                                'estado'        : 'calculado',  
                                                'movido'        : false,
                                                'color'         : {'r':77,  'g':77,  'b':77},
                                                'bgColor'       : {'r':127, 'g':127, 'b':127},
                                                'weight'        : 2,
                                                'blockHeight'   : 0,
                                                'value'         : 0,
                                                'numVin'        : 0,
                                                'numVout'       : 0,
                                                'blockTime'     : 0,
                                                'fees'          : 0,
                                                'multiTxs'      : arrMultiTxs,
                                                'version'       : 0,
                                                'lockTime'      : 0,
                                                'heuristic'     : [],
                                                'esUtxo'        : false,
                                            });

                    }//fin if ( !this.buscaPosiTxs ( 'idTxTra'   ) 
                    if ( !this.#isInPosiTxs (  idTxsOut )){
                        posiTxs.push({    
                                                'idTx'          : idTxsOut ,  
                                                'io'            : 'O'  ,   
                                                'tagTx'         : '', 
                                                'estado'        : 'calculado',    
                                                'movido'        : false,
                                                'color'         : {'r':77,  'g':77,  'b':77},
                                                'bgColor'       : {'r':127, 'g':127, 'b':127},
                                                'weight'        : 2,
                                                'blockHeight'   : 0,
                                                'value'         : 0,
                                                'numVin'        : 0,
                                                'numVout'       : 0,
                                                'blockTime'     : 0,
                                                'fees'          : 0,
                                                'multiTxs'      : arrMultiTxs,
                                                'version'       : 0,
                                                'lockTime'      : 0,
                                                'heuristic'     : [],
                                                'esUtxo'        : esUnUTXO,
                                            });  

                    }//fin if ( !this.buscaPosiTxs (   idTxTra ) 

                    //posiAddrs
                    ///////////
                    if (!this.#isInPosiAddrs(idAddr, idTxTra , idTxsOut )){
                        posiAddrs.push({
                                            'idAddr'    : idAddr, 
                                            'io'        : 'O'   , 
                                            'idTx1'     : idTxTra ,  
                                            'idTx2'     : idTxsOut ,
                                            'tagAddr'   : '', 
                                            'estado'    : 'calculado',
                                            'x1'        : 0,         
                                            'y1'        : 0,  
                                            'x2'        : 0,         
                                            'y2'        : 0,
                                            'angulo'    : 0,         
                                            'distancia' : 0, 
                                            'ancho'     : 7,        
                                            'color'     : {'r':77,  'g':77,  'b':77}, 
                                            'bgColor'   : {'r':127, 'g':127, 'b':127},
                                            'movido'    : false,
                                            'value'     : resUnaTx.vout[i].value,
                                            'esUtxo'    : esUnUTXO,

                                        });   
                    }//fin  if (!#isInPosiAddrs(idAddr, idTxTra , idTxsOut                    
                
                }//fin if (resUnaAddr.txids[j] != idTxTra)

            }//fin for(let j=0; j<resUnaAddr.txids.length; j++)
            
        }//fin for(let i=0; i<resUnaTx.vin.length; i++)

        //Ponemos semaforo a verde para traer mas datos de Txs y Addrs
        estadoDatosTxAddrNN = true;

    }//fin getDatos( idTxTra )




    putTxsAddrs (idTxTra)                                   {

        //Calcula las posiciones AUTOMATICAMENTE de Txs y Addrs a partir de arbolTxsAddrs
        //Solamente se utiliza en putDimAddr => slider de Addr y en doubleClick sobre Tx
        //obteniendo el ¿ángulo? y la distancia a partir del Tx pinchado (doubleclick)
        //Mejora: si el Tx se ha movido anteriormente no variar el ángulo al cambiar los radios de los Addrs
        //Mejora 2 : No variar nunca el ángulo, recalcularlo cuando se mueve Tx

        let numEntradas, numSalidas, anguloEntradas, anguloSalidas, contador;
        let txTra, xCentroTxTra , yCentroTxTra;
        let idTxSatelite, indexTxSatelite;
        let anguloSatelite, xCentroTxSatelite , yCentroTxSatelite, xTxSatelite , yTxSatelite;
        let idTx1, idTx2, indexTx1, indexTx2;

        //let txSatelite, txMovido; //Mejora: ...

        //Centro (x, y ) del sistema. Tx pinchada (doble Click )
        txTra           = posiTxs.find( x => x.idTx === idTxTra );
        xCentroTxTra    = txTra.xCentro;
        yCentroTxTra    = txTra.yCentro;

        //txMovido        = txTra.movido;  //si se ha movido el Tx pinchado, no sirve para nada!

        //Marcamos Tx como pinchada (doubleclick)
        txTra.estado    = 'pinchado';


        //ENTRADAS del arbolTxsAddrs
        //////////////////////////////////////////////////

        //Contamos entradas a idTxTra y calculamos ángulo
        numEntradas = 0;
        for(let i=0; i<arbolTxsAddrs.length; i++) {

            if( (arbolTxsAddrs[i].rama[0] == idTxTra)&&
                (arbolTxsAddrs[i].io == 'I')
            ) {
                numEntradas++;
            }//fin if( (arbolTxsAddrs[i].rama[0] == idTxTra)

        }// fin de for (let i=0; i<arbolTxsAddrs.length; i++) 
        
        anguloEntradas = int(180/(numEntradas + 1));

        //Grabamos angulo y distancia en arbolTxsAddrs
        contador = 1;
        for(let i=0; i<arbolTxsAddrs.length; i++) {

            if( (arbolTxsAddrs[i].rama[0] == idTxTra)&&
                (arbolTxsAddrs[i].io == 'I')
              ){

                anguloSatelite              = anguloEntradas * contador;
                arbolTxsAddrs[i].angulo     = anguloSatelite;
                arbolTxsAddrs[i].distancia  = radioSatelites;
                contador++;

                //Put x, y, xCentro, yCentro en posiTxs
                ////////////////////////////////////////////////////////////////
                idTxSatelite                = arbolTxsAddrs[i].rama[2];

                xCentroTxSatelite           = int( xCentroTxTra - radioSatelites * cos(anguloSatelite ));
                yCentroTxSatelite           = int( yCentroTxTra - radioSatelites * sin(anguloSatelite ));

                xTxSatelite                 = int(xCentroTxSatelite -  anchoTx/2);
                yTxSatelite                 = int(yCentroTxSatelite -  altoTx /2);

                //Busca Tx satelite
                indexTxSatelite             = posiTxs.findIndex(( obj => obj.idTx === idTxSatelite ));

                //Lo recolocamos si ha sido pinchado anteriormente
                if( posiTxs[indexTxSatelite].estado != 'pinchado'){
                    //Put x, y, xCentro, yCentro en posiTxs
                    posiTxs[indexTxSatelite].xCentro    = xCentroTxSatelite;
                    posiTxs[indexTxSatelite].yCentro    = yCentroTxSatelite;

                    posiTxs[indexTxSatelite].x          = xTxSatelite;
                    posiTxs[indexTxSatelite].y          = yTxSatelite;
                }//fin if( posiTxs[indexTxSatelite].estado != 'pinchado')
                
            }//fin if( (arbolTxsAddrs[i].rama[0] == idTxTra)

        }// fin de for (let i=0; i<arbolTxsAddrs.length; i++)         


        //SALIDAS del arbolTxsAddrs
        ////////////////////////////////////////////////// 

        //Contamos salidas a idTxTra y calculamos ángulo
        numSalidas = 0;
        for(let i=0; i<arbolTxsAddrs.length; i++) {
 
             if( (arbolTxsAddrs[i].rama[0] == idTxTra)&&
                 (arbolTxsAddrs[i].io == 'O')
             ) {
                numSalidas++;
             }//fin if( (arbolTxsAddrs[i].rama[0] == idTxTra)

        }// fin de for (let i=0; i<arbolTxsAddrs.length; i++) 

        anguloSalidas = int(180/(numSalidas + 1));

        //Grabamos angulo y distancia  en arbolTxsAddrs
        contador = 1;
        for(let i=0; i<arbolTxsAddrs.length; i++) {

            if ( (arbolTxsAddrs[i].rama[0] == idTxTra)&&
                 (arbolTxsAddrs[i].io == 'O')
               ){

                anguloSatelite              = 180 + (anguloSalidas * contador);
                arbolTxsAddrs[i].angulo     = anguloSatelite;
                arbolTxsAddrs[i].distancia  = radioSatelites;
                contador++;

                //Put x, y, xCentro, yCentro en posiTxs
                ////////////////////////////////////////////////////////////////7
                idTxSatelite                = arbolTxsAddrs[i].rama[2];

                xCentroTxSatelite           = int( xCentroTxTra - radioSatelites * cos(anguloSatelite ) );
                yCentroTxSatelite           = int( yCentroTxTra - radioSatelites * sin(anguloSatelite ) );

                xTxSatelite                 = int(xCentroTxSatelite -  anchoTx/2);
                yTxSatelite                 = int(yCentroTxSatelite -  altoTx /2);

                //Busca Tx satelite
                indexTxSatelite = posiTxs.findIndex(( obj => obj.idTx === idTxSatelite ));

                //Lo recolocamos si ha sido pinchado anteriormente
                if( posiTxs[indexTxSatelite].estado != 'pinchado'){
                    //Put x, y, xCentro, yCentro en posiTxs
                    ////////////////////////////////////////////////////////////////7
                    posiTxs[indexTxSatelite].xCentro    = xCentroTxSatelite;
                    posiTxs[indexTxSatelite].yCentro    = yCentroTxSatelite;

                    posiTxs[indexTxSatelite].x          = xTxSatelite;
                    posiTxs[indexTxSatelite].y          = yTxSatelite;
                }//fin if( posiTxs[indexTxSatelite].estado != 'pinchado')
                
            }//fin if( (arbolTxsAddrs[i].rama[0] == idTxTra)

        }// fin de for (let i=0; i<arbolTxsAddrs.length; i++)          



        //ADDRS
        ////////////////////////////////////////////////// 
        for(let i=0; i<posiAddrs.length; i++) {

            if(posiAddrs[i].io == 'I' ){
                idTx1           = posiAddrs[i].idTx2;
                idTx2           = posiAddrs[i].idTx1;

            }else if(posiAddrs[i].io == 'O' ){
                idTx1           = posiAddrs[i].idTx1;
                idTx2           = posiAddrs[i].idTx2;                

            }//fin if(posiAddrs[i] == 'I' )

    
            //Origen
            //Busca Tx origen en posiTxs
            indexTx1            = posiTxs.findIndex(( obj => obj.idTx === idTx1 ));
                
            if(indexTx1 != -1 ){
                //Put x1, y1 en posiAddrs
                ////////////////////////////////////////////////////////////////7
                posiAddrs[i].x1 = posiTxs[indexTx1].xCentro;
                posiAddrs[i].y1 = posiTxs[indexTx1].yCentro;
                
            }//fin if(indexTx1)

            //Destino
            //Busca Tx destino en posiTxs
            indexTx2            = posiTxs.findIndex(( obj => obj.idTx === idTx2 ));

            if(indexTx2 != -1 ){
                //Put x2, y2 en posiAddrs
                ////////////////////////////////////////////////////////////////7
                posiAddrs[i].x2 = posiTxs[indexTx2].xCentro;
                posiAddrs[i].y2 = posiTxs[indexTx2].yCentro;

            }//fin if(indexTx2)
            
            //Calculamos angulo y distancia con x1, y1, x2, y2  
            //Grabamos en posiAddrs[i].angulo y posiAddrs[i].distancia
            
            this.calculaAnguloDistancia( 
                                         posiAddrs[i].x1 , posiAddrs[i].y1, 
                                         posiAddrs[i].x2 , posiAddrs[i].y2 ,
                                         i  );  

            // //Para corregir pequeños errores, recalculamos Tx y Addr de los Txs extremos del Addr
            // let txCalculada         = posiAddrs[i].idTx1;
            // let indexTxCalculada    = posiTxs.findIndex( (element) => element.idTx === txCalculada);
            // myBchain.recalculaTxAddr(txCalculada, indexTxCalculada);

            // txCalculada         = posiAddrs[i].idTx2;
            // indexTxCalculada    = posiTxs.findIndex( (element) => element.idTx === txCalculada);
            // myBchain.recalculaTxAddr(txCalculada, indexTxCalculada);            
            
        }//fin for(let i=0; i<posiAddrs.length; i++)

        //myBchain.dibujaTxsAddrs();
              
    }//fin putTxsAddrs ()

    dibujaTxsAddrs()                                        {

        push();

        background(222);
        //  imagen de fondo image(imagenBg, 0,0, windowWidth   ,  windowHeight );

        angleMode(DEGREES);
        textFont('Roboto');

        //Rayado
        if( mostrarRayado ) this.rayado();
        
        //Ocultamos ventana de ayuda  Lo he puesto en cadabotón o tecla de acción
        myVentana.oculta();
        ayudaVentana.oculta();

        //Dibuja Addrs
        //////////////////////////////////////////////////////////
        let arrowSize   = 5;
        let sentido     = -1;
        let puntoCentral, angulo;
        let verticeA, verticeB, verticeC;

        let curveColor  ;
        let squareColor ;
        let bordeColor;
        
        //ADDRs
        //////////////////////////////////////////////////////////
        for(let i=0; i<posiAddrs.length; i++) {
        
            //LINEA ADDR
            //////////////////////////////////////////////////////////
            //Ancho del Addr
//Cambiar en funcion del posiAddrs[i].value

            strokeWeight(posiAddrs[i].ancho);
            
            //Color line Addr
            curveColor = color (  
                                  int( posiAddrs[i].bgColor.r ) , 
                                  int( posiAddrs[i].bgColor.g ) ,
                                  int( posiAddrs[i].bgColor.b ) 
                               );
            curveColor.setAlpha(240);
            stroke(curveColor);

            //Elimina / Pone Sombra
            if (mostrarSombra) this.sombra(2 , 3);

            if (!posiAddrs[i].esUtxo){
                line(
                        posiAddrs[i].x1, posiAddrs[i].y1, 
                        posiAddrs[i].x2, posiAddrs[i].y2
                    );
            } else {
                curveColor = color ( '#77F' );
                stroke(curveColor);

                line(
                    posiAddrs[i].x1, posiAddrs[i].y1, 
                    posiAddrs[i].x2, posiAddrs[i].y2
                );
            }

            //FLECHA ADDR
            //////////////////////////////////////////////////////////
            //Punto central entre los dos puntos del addr
            puntoCentral = createVector (
                                          Math.min( posiAddrs[i].x1,  posiAddrs[i].x2 ) + 
                                          Math.abs((posiAddrs[i].x2 - posiAddrs[i].x1)/2)  , 

                                          Math.min( posiAddrs[i].y1,  posiAddrs[i].y2 ) + 
                                          Math.abs((posiAddrs[i].y2 - posiAddrs[i].y1)/2)  
                                        );

            angulo       = atan(  
                                  (posiAddrs[i].y2 - posiAddrs[i].y1) / 
                                  (posiAddrs[i].x2 - posiAddrs[i].x1)
                                ); 

            

            if (posiAddrs[i].x1 <= posiAddrs[i].x2){
              sentido = - 1;
            }else{
              sentido =   1;
            }//fin de if (posiAddrs[i].x1 <= posiAddrs[i].x2)

            verticeA = createVector( puntoCentral.x ,     puntoCentral.y );
            verticeB = createVector( sentido * arrowSize, 0 );
            verticeC = createVector( 0,                   sentido * arrowSize ); 

            translate(puntoCentral.x  ,  puntoCentral.y); 
            rotate( angulo  - 45  );

            triangle(0, 0, verticeB.x, verticeB.y, verticeC.x, verticeC.y);

            rotate( 45  -  angulo );

            if (posiAddrs[i].esUtxo){
                text ('UTXO' ,  verticeB.x + 17, verticeB.y );
            }

            translate(-puntoCentral.x , -puntoCentral.y);



        }//fin for(let i=0; i<posiAddrs.length; i++) ADDRs





        //TXs
        //////////////////////////////////////////////////////////
        strokeWeight(1);

        for(let i=0; i<posiTxs.length; i++) {
        
            //Rectángulo
            ////////////////////////////////////////
            squareColor = color (int( posiTxs[i].bgColor.r ) , 
                                 int( posiTxs[i].bgColor.g ) ,
                                 int( posiTxs[i].bgColor.b ) );
            squareColor.setAlpha(245);
            fill(squareColor);
            stroke(3);

            bordeColor = color (int( posiTxs[i].color.r ) , 
                                int( posiTxs[i].color.g ) ,
                                int( posiTxs[i].color.b ) );  

            stroke(bordeColor);
            strokeWeight(posiTxs[i].weight);

            //Elimina / Pone Sombra
            if (mostrarSombra) this.sombra(5 , 10);


            if(posiTxs[i].x){
                if(!posiTxs[i].esUtxo){
                    rect( posiTxs[i].x,     posiTxs[i].y, 
                          anchoTx     ,     altoTx , 7);
                }else{
                    fill('#77F');
                    rect( posiTxs[i].x,     posiTxs[i].y, 
                          anchoTx     ,     altoTx , 7);
                    fill(squareColor);
                }

            }//fin if(posiTxs[i].x)

            //Elimina / Pone Sombra
            if (mostrarSombra) this.sombra(0 , 0);

            //Texto
            ////////////////////////////////////////
            //Size
            textoSize = (16/200) * anchoTx;
            textSize( textoSize );
            strokeWeight(2);

            stroke(66);

            //ESpaciado
            textoEspaciado = int(altoTx / numLineasTx);

            //Margen Izquierdo Tx
            margenIzqTx = int(anchoTx * 0.05);

            //Elimina / Pone Sombra
            if (mostrarSombra) this.sombra(0);

            fill(0);
            drawingContext.shadowBlur = 0;

            //id Tx
            let idTxCorto;
            if((posiTxs[i].idTx).substring(0, 5) == 'Multi'){
                idTxCorto = (posiTxs[i].idTx).substring(6);

                idTxCorto = idTxCorto.replace('-', '\n sent:')

                //txid
                margenIzqTx = 15;
                text (idTxCorto ,        
                      posiTxs[i].x + margenIzqTx, 
                      posiTxs[i].y +  (2 * textoEspaciado) - 0 );                

            }else{

                idTxCorto = this.#acortaIdTx (posiTxs[i].idTx);

                //txid
                margenIzqTx = (anchoTx/2) - (textWidth(idTxCorto)/2);
                text (idTxCorto ,        
                        posiTxs[i].x + margenIzqTx, 
                        posiTxs[i].y +  (1 * textoEspaciado) - 0 );                

                //blockHeight
                margenIzqTx = (anchoTx/2) - (textWidth(posiTxs[i].blockHeight)/2);
                text ((posiTxs[i].blockHeight).toLocaleString("es-ES") ,        
                      posiTxs[i].x + margenIzqTx, 
                      posiTxs[i].y +  (2 * textoEspaciado) - 0 );
                
                //blockTime
                margenIzqTx = (anchoTx/2) - (textWidth(myTime(posiTxs[i].blockTime))/2);
                text (myTime(posiTxs[i].blockTime) ,        
                      posiTxs[i].x + margenIzqTx, 
                      posiTxs[i].y +  (3 * textoEspaciado) - 0 );            
                
                //sat/vB – sats
                margenIzqTx = (anchoTx/2) - (textWidth('sat/vB – sats')/2);
                text ('sat/vB – sats' ,        
                    posiTxs[i].x + margenIzqTx, 
                    posiTxs[i].y +  (4 * textoEspaciado) - 0 );   
                
                //version - lockTime
                margenIzqTx = (anchoTx/2) - (textWidth(posiTxs[i].version  + ' - ' + posiTxs[i].lockTime)/2);
                text (posiTxs[i].version  + ' - ' + posiTxs[i].lockTime,        
                    posiTxs[i].x + margenIzqTx, 
                    posiTxs[i].y +  (5 * textoEspaciado) - 0 ); 
                        
            }//fin if((posiTxs[i].idTx).substring(0,5) == 'Multi'


            //Etiqueta
            if (posiTxs[i].tagTx){
                margenIzqTx = (anchoTx/2) - (textWidth(posiTxs[i].tagTx)/2);
                text (posiTxs[i].tagTx , 
                      posiTxs[i].x + margenIzqTx, 
                      posiTxs[i].y + (6 * textoEspaciado) - 0 );
            }//fin if (posiTxs[i].tagTx)


            // ¿Es un UTXO?
            if(posiTxs[i].esUtxo){
                let posiX = posiTxs[i].x - 15;

                fill('#77F');
                text ('U' , 
                      posiX, 
                      posiTxs[i].y + (2 * textoEspaciado));
                text ('T' , 
                      posiX, 
                      posiTxs[i].y + (3 * textoEspaciado));
                text ('X' , 
                      posiX, 
                      posiTxs[i].y + (4 * textoEspaciado));
                text ('O' , 
                      posiX, 
                      posiTxs[i].y + (5 * textoEspaciado));
                fill(0);
            }//fin if(posiTxs[i].esUtxo)



        }// fin de for(let i=0; i<posiTx; i++  TXs

        //Dibujamos circulos rojos para eliminar
        if(marcaParaEliminar){
          this.circuloParaEliminar();
        }//fin 

        //Dibujamos circulos rojos Heuristicas
        ////////////////////////////////////////
        for(let i=0; i<posiTxs.length; i++) {
            
            textoEspaciado = int(altoTx / 9);
            noStroke();
            let radio = 16 * sf;
            for(let j=0; j<posiTxs[i].heuristic.length; j++) {

                if(posiTxs[i].heuristic[j]){
                    fill('red');
                    ellipse (posiTxs[i].x + 10 ,
                             posiTxs[i].y + 10 , 
                             radio, radio);

                }else{
                    // No hacemos nada
                    // fill('green');n
                    

                }//fin if(posiTxs[i].heuristic[j]

                // ellipse (posiTxs[i].x - 10 ,
                //          posiTxs[i].y + (j * textoEspaciado) + 14 , 
                //          radio, radio) ;

            }//fin for(let j=0; j<posiTxs[i].heuristic.length; j++

        }//fin for(let i=0; i<posiTxs.length; i++) {        


        //Muestra ventana del pié
        if(muestraPie ) this.ventanaPie();

        pop();

    }//fin dibujaTxsAddrs

    recalculaZoomTxAddr( txEnMovimiento, idTxEnMovimiento ) {

        let xCentroMoviendo, yCentroMoviendo;


        ///////////////////////////////////////////////////////////////////////
        //posiTxs
        ///////////////////////////////////////////////////////////////////////

        xCentroMoviendo                     = txEnMovimiento.xCentro;
        yCentroMoviendo                     = txEnMovimiento.yCentro;


        ///////////////////////////////////////////////////////////////////////
        //posiAddrs
        ///////////////////////////////////////////////////////////////////////    
        //Recolocamos x1, y1, x2, y2 de posiAddrs
        for(let i=0; i<posiAddrs.length; i++) {

            //En idTx2 están los satélites
            if(posiAddrs[i].idTx2 == txEnMovimiento.idTx ){

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'

            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


            //En idTx1 está el Centro
            if(posiAddrs[i].idTx1 == txEnMovimiento.idTx ){

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'
            
            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento

        }//fin for(let i=0; i<posiAddrs.length; i++)

      
    }//fin recalculaZoomTxAddr

    recalculaTodosTxsAddrs()                                {

        //Utilizado en mousedownFueraTx

        let txMoviendo;
        let xCentroMoviendo, yCentroMoviendo;
    
        //Recorremos todos los Txs reposicionando sus coordenadas
        for(let i=0; i<posiTxs.length; i++) {

            //this.recalculaTxAddr( posiTxs[i], i );
          
            txMoviendo     = posiTxs[i].idTx;

            ///////////////////////////////////////////////////////////////////////
            //posiTxs
            ///////////////////////////////////////////////////////////////////////
            //Reposicionamos x, y, centro del Tx
            posiTxs[i].x         += int( mouseX - mouseXIni );
            posiTxs[i].y         += int( mouseY - mouseYIni );

            xCentroMoviendo      = int( posiTxs[i].x + (anchoTx / 2) );
            yCentroMoviendo      = int( posiTxs[i].y + (altoTx  / 2) );

            posiTxs[i].xCentro   = xCentroMoviendo;
            posiTxs[i].yCentro   = yCentroMoviendo;
            

            ///////////////////////////////////////////////////////////////////////
            //posiAddrs
            ///////////////////////////////////////////////////////////////////////    
            //Recolocamos x1, y1, x2, y2 de posiAddrs
            for(let i=0; i<posiAddrs.length; i++) {

                //En idTx2 están los satélites
                if(posiAddrs[i].idTx2 == txMoviendo ){

                    //Si es una entrada
                    if(posiAddrs[i].io == 'I'){
                        posiAddrs[i].x1             = xCentroMoviendo;
                        posiAddrs[i].y1             = yCentroMoviendo;
                    } else if(posiAddrs[i].io == 'O'){
                        posiAddrs[i].x2             = xCentroMoviendo;
                        posiAddrs[i].y2             = yCentroMoviendo;
                    }//fin if(posiAddrs[j].io == 'I'

                }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


                //En idTx1 está el Centro
                if(posiAddrs[i].idTx1 == txMoviendo ){

                    //Si es una entrada
                    if(posiAddrs[i].io == 'I'){
                        posiAddrs[i].x2             = xCentroMoviendo;
                        posiAddrs[i].y2             = yCentroMoviendo;
                    } else if(posiAddrs[i].io == 'O'){
                        posiAddrs[i].x1             = xCentroMoviendo;
                        posiAddrs[i].y1             = yCentroMoviendo;
                    }//fin if(posiAddrs[j].io == 'I'
                
                }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento



                //calculaAnguloDistancia(x1,y1,x2,y2, i){}



            }//fin for(let i=0; i<posiAddrs.length; i++)


        }// fin de for(let i=0; i<posiTxs.length; i++)
          

        // //recogemos la nueva posición del mouse
        mouseXIni        = mouseX;
        mouseYIni        = mouseY;          

    }//fin recalculaTodosTxsAddrs

    recalculaTxAddr( txEnMovimiento, idTxEnMovimiento )     {

        let xCentroMoviendo, yCentroMoviendo;


        ///////////////////////////////////////////////////////////////////////
        //posiTxs
        ///////////////////////////////////////////////////////////////////////
        //Reposicionamos x, y, centro del Tx
        posiTxs[idTxEnMovimiento].x         += int( mouseX - mouseXIni );
        posiTxs[idTxEnMovimiento].y         += int( mouseY - mouseYIni );

        xCentroMoviendo                     = int( posiTxs[idTxEnMovimiento].x + (anchoTx / 2) );
        yCentroMoviendo                     = int( posiTxs[idTxEnMovimiento].y + (altoTx  / 2) );

        posiTxs[idTxEnMovimiento].xCentro   = xCentroMoviendo;
        posiTxs[idTxEnMovimiento].yCentro   = yCentroMoviendo;
    

        ///////////////////////////////////////////////////////////////////////
        //posiAddrs
        ///////////////////////////////////////////////////////////////////////    
        //Recolocamos x1, y1, x2, y2 de posiAddrs
        for(let i=0; i<posiAddrs.length; i++) {

            //En idTx2 están los satélites
            if(posiAddrs[i].idTx2 == txEnMovimiento ){

                posiAddrs[i].movido = true;

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'

            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


            //En idTx1 está el Centro
            if(posiAddrs[i].idTx1 == txEnMovimiento ){

                posiAddrs[i].movido = true;

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'

            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


//calculaAnguloDistancia(x1,y1,x2,y2, i){}
//calculaAnguloDistancia(x1,y1,x2,y2, i){}
            //Calculamos angulo y distancia con x1, y1, x2, y2  
            //Grabamos en posiAddrs[i].angulo y posiAddrs[i].distancia
            // if( posiAddrs[i].io == 'I' ){

            //     this.calculaAnguloDistancia( posiAddrs[i].x2, posiAddrs[i].y2,
            //                                  posiAddrs[i].x1, posiAddrs[i].y1 ,
            //                                  i );   


            // }else if( posiAddrs[i].io == 'O' ){
            
                //Pasar parámetros en el orden x1, y1, x2, y2
            this.calculaAnguloDistancia( 
                                         posiAddrs[i].x1 , posiAddrs[i].y1, 
                                         posiAddrs[i].x2 , posiAddrs[i].y2 ,
                                         i );  


            // }//fin if(posiAddrs[i].io == 'I'            

        }//fin for(let i=0; i<posiAddrs.length; i++)


        //recogemos la nueva posición del mouse
        mouseXIni        = mouseX;
        mouseYIni        = mouseY;  


    }//fin recalculaTxAddr
    
    recalculaTxsSeleccionados( txsSeleccionados )           {

        let txParaMover, idTxParaMover;
        let xCentroMoviendo, yCentroMoviendo;
    
        //Recorremos los idTx seleccionados
        for(let i=0; i<txsSeleccionados.length; i++) {
          
            txParaMover     = txsSeleccionados[i];
            idTxParaMover   = posiTxs.findIndex(posiTxs => posiTxs.idTx === txParaMover);


            ///////////////////////////////////////////////////////////////////////
            //posiTxs
            ///////////////////////////////////////////////////////////////////////
            //Reposicionamos x, y, centro del Tx
            posiTxs[idTxParaMover].x         += int( mouseX - mouseXIni );
            posiTxs[idTxParaMover].y         += int( mouseY - mouseYIni );

            xCentroMoviendo                   = int( posiTxs[idTxParaMover].x + (anchoTx / 2) );
            yCentroMoviendo                   = int( posiTxs[idTxParaMover].y + (altoTx  / 2) );

            posiTxs[idTxParaMover].xCentro    = xCentroMoviendo;
            posiTxs[idTxParaMover].yCentro    = yCentroMoviendo;
            

            ///////////////////////////////////////////////////////////////////////
            //posiAddrs
            ///////////////////////////////////////////////////////////////////////    
            //Recolocamos x1, y1, x2, y2 de posiAddrs
            for(let i=0; i<posiAddrs.length; i++) {

                //En idTx2 están los satélites
                if(posiAddrs[i].idTx2 == txParaMover ){

                    //Si es una entrada
                    if(posiAddrs[i].io == 'I'){
                        posiAddrs[i].x1             = xCentroMoviendo;
                        posiAddrs[i].y1             = yCentroMoviendo;
                    } else if(posiAddrs[i].io == 'O'){
                        posiAddrs[i].x2             = xCentroMoviendo;
                        posiAddrs[i].y2             = yCentroMoviendo;
                    }//fin if(posiAddrs[j].io == 'I'


                    //calculaAnguloDistancia(x1,y1,x2,y2, i){}


                }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


                //En idTx1 está el Centro
                if(posiAddrs[i].idTx1 == txParaMover ){

                    //Si es una entrada
                    if(posiAddrs[i].io == 'I'){
                        posiAddrs[i].x2             = xCentroMoviendo;
                        posiAddrs[i].y2             = yCentroMoviendo;
                    } else if(posiAddrs[i].io == 'O'){
                        posiAddrs[i].x1             = xCentroMoviendo;
                        posiAddrs[i].y1             = yCentroMoviendo;
                    }//fin if(posiAddrs[j].io == 'I'


                    //calculaAnguloDistancia(x1,y1,x2,y2, i){}

                
                }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento

            }//fin for(let i=0; i<posiAddrs.length; i++)


        }// fin de for for(let i=0; i<txsSeleccionados.length;
          

        //recogemos la nueva posición del mouse
        mouseXIni        = mouseX;
        mouseYIni        = mouseY;  


    }//fin recalculaTxsSeleccionados( txsSeleccionados )

    calculaXYDesdeAnguloDistancia (angulo, distancia, i,io ){

        let xPlaneta, yPlaneta , xSatelite, ySatelite;

        if(io=='I'){
            xPlaneta        = posiAddrs[i].x2;
            yPlaneta        = posiAddrs[i].y2;

            xSatelite       = int(xPlaneta - posiAddrs[i].distancia * cos(posiAddrs[i].angulo));
            ySatelite       = int(yPlaneta - posiAddrs[i].distancia * sin(posiAddrs[i].angulo));

            //Si no coincide calculado con valor grabado, dejamos el grabado
            if (posiAddrs[i].x1 != xSatelite)  xSatelite = posiAddrs[i].x1;
            if (posiAddrs[i].y1 != ySatelite)  ySatelite = posiAddrs[i].y1;
            
            posiAddrs[i].x1 = xSatelite
            posiAddrs[i].y1 = ySatelite

        }//fin if(io=='I')

        if(io=='O'){
            xPlaneta        = posiAddrs[i].x1;
            yPlaneta        = posiAddrs[i].y1;

            xSatelite       = int(xPlaneta + posiAddrs[i].distancia * cos(posiAddrs[i].angulo));
            ySatelite       = int(yPlaneta + posiAddrs[i].distancia * sin(posiAddrs[i].angulo));

            //Si no coincide calculado con valor grabado, dejamos el grabado
            if (posiAddrs[i].x2 != xSatelite)  xSatelite = posiAddrs[i].x2;
            if (posiAddrs[i].y2 != ySatelite)  ySatelite = posiAddrs[i].y2;

            posiAddrs[i].x2 = xSatelite
            posiAddrs[i].y2 = ySatelite
        }//fin if(io=='O')


    }//fin calculaXYDesdeAnguloDistancia

    calculaAnguloDistancia(x1, y1, x2, y2, i  )             {

        //MODIFICADO para que trate igual I que O

        let distancia, angulo, io, idAddr, indexArbolTxsAddrs;

        io                      = posiAddrs[i].io;
        idAddr                  = posiAddrs[i].idAddr;


        distancia               = int( Math.sqrt( (x1 - x2)**2 + (y1 - y2)**2 ) );
        posiAddrs[i].distancia  = distancia;

        if(io=='I'){
            angulo              = int( acos( (x2 - x1) / distancia  ) ); 

        }else if(io=='O'){
            angulo              = int( acos( (x1 - x2) / distancia  ) );

        }

        if(io=='O'){
            angulo = 360 - angulo;
        }//fin if(io=='O')

        posiAddrs[i].angulo         = angulo; 


        //Actualiza angulo y distancia en arbolTxsAddrs
        //OJO , las addr entre dos TX guarda el angulo de la última addr en posiAddrs
        for(let i=0; i<arbolTxsAddrs.length; i++) {
            if(arbolTxsAddrs[i].rama[1] == idAddr){
                arbolTxsAddrs[i].angulo    = angulo;
                arbolTxsAddrs[i].distancia = distancia;
                //break;
            }//fin if(arbolTxsAddrs[i].rama[1] == idAddr)
        }//fin for(let i=0; i<arbolTxsAddrs.le
        
        
            
    }//fin calculaAnguloDistancia

    contenidoAyuda(ancho , alto)                            {
        
        let miMenu;

        document.getElementById("idDivAyuda").style.visibility      = 'visible';
        document.getElementById("idLiteralAyuda").style.visibility  = 'visible';
        //document.getElementById("idBotonPlay").style.visibility     = 'visible';
        
        divAyuda.position(ayudaVentana.x + 20 ,70); 
        divAyuda.size(ancho , alto);



        miMenu =    "<h2>Ayuda</h2>" +

                    "<input  id ='botonVideosAyuda'      type ='submit'  " +
                    "value  ='Presentación' onclick=cambiaVideo('presentacionExcabit.mp4'); )/></br>" +

                    "<dl>"+

                        "<dt><h4>Desplegar Inputs / Outputs de un Tx</h4></dt>" +
                            "<dd><b>Doble Click</b> sobre Tx</br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('desplegarInputs.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" + 

                        "<dt><h4>Mover Tx</h4></dt>" +
                            "<dd><b>Click</b> sobre Tx y arrastrar</dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('moverTx.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Zoom</h4></dt>" +
                            "<dd><b>Rueda </b> del ratón.</dd>" +
                            "<dd>Nota.- Centra imagen antes de iniciar zoom.</dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('zoomCanvas.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Selec. / Deselec. un Tx</h4></dt>" +
                            "<dd><b>Shift + Click</b> sobre Tx o Botón <b>select.</b> </br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('selecTx.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Selec. / Deselec. Txs dentro de un Área </h4></dt>" +
                            "<dd><b>z o Z + Click pulsado</b> sobre un área con Txs </br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('selecAreaTxs.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Etiquetar Tx</h4></dt>" +
                            "<dd><b>Ctrl + Click</b> sobre Tx</br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('etiquetarTx.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +  

                        "<dt><h4>Colorear Tx</h4></dt>" +
                            "<dd><b>Alt + Click</b> sobre Tx</br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('colorearTx.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Mostrar Información de Tx o Addr</h4></dt>" +
                            "<dd><b>i o I + Click</b> sobre Tx o Addr</br></dd>" +
                            "<dd><b>Cursor</b> sobre Tx o Addr</br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('informacionTxAddr.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Ocultat Información de Tx o Addr</h4></dt>" +
                            "<dd>Botón <b> con info.</b></br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('sinInformacionTxAddr.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +

                        "<dt><h4>Marcar / Desmarcar para eliminar</h4>  </dt>" +
                            "<dd><b>d o D + Click</b>  o Botón <b>eliminar</b> </br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('marcarDesmarcarEliminarTx.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +                            
                            
                        "<dt><h4>Imprimir</h4></dt>" +
                            "<dd><b>p o P + Click</b>  o Botón <b>imprimir</b> </br></dd>" +
                            "<dd><input  id ='botonVideosAyuda'      type ='submit'  " +
                            "value  ='Ver vídeo' onclick=cambiaVideo('imprimirCanvas.mp4'); )/></dd>" +
                            "<dd>&nbsp;</dd>" +
                            
                        "<dt><h4>Grabar vídeo</h4></dt>" +
                            "<dd><b>v o V + Click</b>  o Botón <b>vídeo</b> </br></dd>" +
                            "<dd>&nbsp;</dd>" +

                     "</dl>"  +
                     
                     "<b>Click = </b> Pulsar botón izquierdo del ratón.<br><br>" +

                     "<b>Botones barra inferior :</b> <br>" +
                     " &nbsp;&nbsp;&nbsp;Mouse Over para obtener ayuda." 
                     
                    ;

        divAyuda.html(miMenu, false);
        

    }//fin contenidoAyuda

    editTagTx ( txEditTag )                                 {

        myBchain.mueveFueraColorTag();

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();  
        myBchain.dibujaTxsAddrs();      
      
        for( let j=0; j<posiTxs.length; j++) {
      
          //Buscamos el Tx a editar
          if ( (posiTxs[j].idTx) == txEditTag ){
      
            let miTag = posiTxs[j].tagTx;
            jj        = j;
      
            inputTags.position(posiTxs[j].x + 10,  posiTxs[j].y + altoTx + 55);
            inputTags.addClass("inputTags");
            inputTags.size(150);
            
            inputTags.id('idTxtTag');
            inputTags.attribute('autofocus', "autofocus");
            if(miTag){
              document.getElementById("idTxtTag").value = miTag;
            }//fin if(miTag)
            document.getElementById("idTxtTag").focus();
      
            buttonTag.position(posiTxs[j].x + 175, posiTxs[j].y + altoTx + 57);
            buttonTag.mousePressed(myBchain.grabaTagTx);
            
          }//fin if ( (posiTxs[j].idTx) == txEditTag )
      
        }//fin for(let j=0; j<posiTxs.length; j++)
          
    }//fin  editTagTx ( txEditTag )
    
    grabaTagTx()                                            {
    
        const name = document.getElementById("idTxtTag").value  ;
        posiTxs[jj].tagTx = name ;
        
        myBchain.mueveFueraColorTag();

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();  
            
        document.getElementById("idTxtTag").value = "";

        //Mostramos info
        mostrarInfo = true;
        botonInfo.html('con info.');

        myBchain.dibujaTxsAddrs();
    
    }//fin  grabaTagTx()

    editColorTx ( txEditColor )                             {

        myBchain.mueveFueraColorTag();

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();  
        myBchain.dibujaTxsAddrs();         
        
        for( let j=0; j<posiTxs.length; j++) {
      
          //Buscamos el Tx a editar color
          if ( (posiTxs[j].idTx) == txEditColor ){
      
            jj        = j;
      
            // buttonColor1 = createButton('-');
            buttonColor1.style('background-color', 'red' );
            buttonColor1.style('color', 'red');
            buttonColor1.position(0 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor1.mousePressed(() => {myBchain.grabaColorTx (1) } ); 
            
            // buttonColor2 = createButton('-');
            buttonColor2.style('background-color', 'blue');
            buttonColor2.style('color', 'blue');
            buttonColor2.position(1 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor2.mousePressed(() => {myBchain.grabaColorTx (2) }  ); 
      
            // buttonColor3 = createButton('-');
            buttonColor3.style('background-color', 'green');
            buttonColor3.style('color', 'green');
            buttonColor3.position(2 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor3.mousePressed(() => {myBchain.grabaColorTx (3) }  ); 
      
            // buttonColor4 = createButton('-');
            buttonColor4.style('background-color', '#FFFF00');
            buttonColor4.style('color', '#FFFF00');
            buttonColor4.position(3 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor4.mousePressed(() => {myBchain.grabaColorTx (4) }  ); 
      
            // buttonColor5 = createButton('-');
            buttonColor5.style('background-color', '#00FFFF');
            buttonColor5.style('color', '#00FFFF');
            buttonColor5.position(4 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor5.mousePressed(() => {myBchain.grabaColorTx (5) }  ); 
      
            // buttonColor6 = createButton('-');
            buttonColor6.style('background-color', '#FF00FF');
            buttonColor6.style('color', '#FF00FF');
            buttonColor6.position(5 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 60);
            buttonColor6.mousePressed(() => {myBchain.grabaColorTx (6) }  ); 
      
            // buttonColor7 = createButton('-----------------------------------------');
            buttonColor7.style('background-color', '#7F7F7F');
            buttonColor7.style('color', '#7F7F7F' );
            buttonColor7.style('height', '11px');
            buttonColor7.position(0 * anchoRectColor + posiTxs[j].x +  12 , 
                                  posiTxs[j].y +  altoTx + 90);
            buttonColor7.mousePressed(() => {myBchain.grabaColorTx (7) }  ); 
      
          }//fin if ( (posiTxs[j].idTx) == txEditTag )
      
        }//fin for(let j=0; j<posiTxs.length; j++)  
          
    }//fin  editColorTx ( txEditTag )
    
    grabaColorTx(color)                                     {
        
        let seleccionado = false;

        if (color == 1 ) {
          posiTxs[jj].bgColor = {'r':256, 'g':0, 'b':0};
          seleccionado = true;
        
        }else if (color == 2) {
          posiTxs[jj].bgColor = {'r':0, 'g':0, 'b':255};
          seleccionado = true;
        
        }else if (color == 3) {
          posiTxs[jj].bgColor = {'r':0, 'g':255, 'b':0};
          seleccionado = true;
        
        }else if (color == 4) {
          posiTxs[jj].bgColor = {'r':255, 'g':255, 'b':0};
          seleccionado = true;
        
        }else if (color == 5) {
          posiTxs[jj].bgColor = {'r':0, 'g':255, 'b':255};
          seleccionado = true;
        
        }else if (color == 6) {
          posiTxs[jj].bgColor = {'r':255, 'g':0, 'b':255};
          seleccionado = true;
        
        }else if (color == 7) {
          posiTxs[jj].bgColor = {'r':127, 'g':127, 'b':127};
          seleccionado = true;
        
        }//fin if (color == 1 )
      
        if(seleccionado){
        
          myBchain.mueveFueraColorTag();
        
        }//fin if(seleccionado){
 
        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();  
        
        //Mostramos info
        mostrarInfo = true;
        botonInfo.html('con info.');
      
        myBchain.dibujaTxsAddrs();   
    
      //cambiandoColor = true;
    
    }//fin  grabaColorTx(color)




    ////////////////////////////////////////////////////////////////////////////////////////
    //Métodos Auxiliares
    ////////////////////////////////////////////////////////////////////////////////////////

    putAnchoAlto(ancho, alto, miRadioSatelites){
        anchoTx         = ancho;
        altoTx          = alto;
        radioSatelites  = miRadioSatelites;

        // relAspectoTx    = anchoTx / altoTx;

        //Actualizamos los sliders
        sliderTx.value(anchoTx);
        sliderAddr.value( radioSatelites);

    }//fin  putAnchoAlto(ancho, alto, miRadioSatelites)

    estaDentroTx(  posiTxTra )                              {
        let okTx = 0;
  
        if (
            ( mouseX > posiTxTra.x) && (mouseX < posiTxTra.x + anchoTx ) && 
            ( mouseY > posiTxTra.y) && (mouseY < posiTxTra.y + altoTx  )
           ){
         
            okTx =  posiTxTra.idTx;
           
        }//fin de if ( ( mouseX > posiTxTra.x) && (mouseX < posiTxTra.x + anchoTx )
      
        return okTx;

    }//fin estaDentroTx

    estaDentroAddr ( addrTrab  )                            {

        let okAddr = 0;
      
        let ancho     = addrTrab.ancho;
        let d, A, B, C, pendiente;
        let mouseDentroSegmento = false;
      
        //Si es una linea vertical => pendiente = infinito
        if(addrTrab.x2 == addrTrab.x1){
          d = Math.abs (  mouseX - addrTrab.x1 );
        }else{
          pendiente = (addrTrab.y2 - addrTrab.y1) / (addrTrab.x2 - addrTrab.x1);
          A         = pendiente;
          B         = - 1;
          C         = addrTrab.y1 - (pendiente * addrTrab.x1);
          d         = Math.abs ( (A * mouseX + B * mouseY + C) / Math.sqrt (A**2 + B**2) );
         
        }//fin if(dimAddrTrab.x2 == dimAddrTrab.x1)


        //Comprobamos que mouse está dentro del segmento (x1,y1) - (x2, y2)
        if( ((mouseX >= addrTrab.x1 && mouseX <= addrTrab.x2) || 
             (mouseX <= addrTrab.x1 && mouseX >= addrTrab.x2))  
            &&
            ((mouseY >= addrTrab.y1 && mouseY <= addrTrab.y2) || 
             (mouseY <= addrTrab.y1 && mouseY >= addrTrab.y2)) 
            ){

            mouseDentroSegmento = true;

        }//fin if( ((mouseX >= addrTrab.x1 && mouseX <= addrT
        
        //Si esta dentro de addr
        if ((d <= int(ancho/2) && mouseDentroSegmento)){
         
          okAddr =  addrTrab.idAddr;
           
        }//fin de if ( (mouseX > allTx[1].x) && (
      
        return okAddr;
      
    }//fin  estaDentroAddr  

    estaDentroHeuris(  posiTxTra )                          {
        let okTx = 0;
  
        if (
            ( mouseX > posiTxTra.x  ) && (mouseX < posiTxTra.x + 25 ) && 
            ( mouseY > posiTxTra.y  ) && (mouseY < posiTxTra.y + 25 )
           ){

        // if (
        //         ( mouseX > posiTxTra.x - 15 ) && (mouseX < posiTxTra.x - 1 ) && 
        //         ( mouseY > posiTxTra.y) && (mouseY < posiTxTra.y + altoTx  )
        //     ){            
         
            okTx =  posiTxTra.idTx;
           
        }//fin de if ( ( mouseX > posiTxTra.x) && (mouseX < posiTxTra.x + anchoTx )
      
        return okTx;

    }//fin estaDentroHeuris

    selectUnselectTxs()                                     {

        
        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();

        //Si vamos a seleccionar quitamos circulo de eliminar
        marcaParaEliminar = false;
        myBchain.dibujaTxsAddrs();
        

        //Si hay seleccionados => desseleccionamos
        if (txsSeleccionados.length > 0 ){

            let txParaDeselec, idTxDeselec;
            for(let i=0; i<txsSeleccionados.length; i++) {
            
                txParaDeselec   = txsSeleccionados[i];
                idTxDeselec     = posiTxs.findIndex(posiTxs => posiTxs.idTx === txParaDeselec);
                posiTxs[idTxDeselec].color  = {'r':77,  'g':77,  'b':77};
                posiTxs[idTxDeselec].weight = 2;

            }//fin for(let i=0; i<txsSeleccionados.length; i++

            txsSeleccionados  = Array();

            botonSelec.html('selec.');

        }else {
            for(let i=0; i<posiTxs.length; i++) {

                txsSeleccionados.push(posiTxs[i].idTx);

                posiTxs[i].color  = {'r':255,  'g':77,  'b':77};
                posiTxs[i].weight = 4;

            }//fin for(let i=0; i<posiTxs.length;

            botonSelec.html('unSelec.');


        }//fin if (txsSeleccionados.length > 0 

        // //Ocultamos ventana de ayuda
        // myVentana.oculta();
        // ayudaVentana.oculta();

        myBchain.dibujaTxsAddrs();
        
    }//fin selectUnselectTxs

    eliminaTxAddr()                                         {

        let distanciaRatonCentrocirculo;

          
        for(let i=0; i<txsCirculoRojo.length; i++) {
      
            distanciaRatonCentrocirculo = Math.sqrt( (txsCirculoRojo[i].x - mouseX)**2 + 
                                                     (txsCirculoRojo[i].y - mouseY)**2 );
      
            //ratón click  dentro del circulo
            if ( distanciaRatonCentrocirculo <= txsCirculoRojo[i].radio  ){
            
                //Eliminamos de arbolTxsAddrs al revés
                for( let k=arbolTxsAddrs.length - 1; k>=0; k--) {

                  if( 
                      (txsCirculoRojo[i].idTx == arbolTxsAddrs[k].rama[0]) ||
                      (txsCirculoRojo[i].idTx == arbolTxsAddrs[k].rama[2])
                    ){

                    arbolTxsAddrs.splice(k, 1);

                  }//fin if( txsCirculoRojo[i].idTx == arbolTxsAddrs[k].rama[0]
                
                }//fin for(let k=0; k<arbolTxsAddrs.length; k++)
              
              
                //Eliminamos de posiTxs al revés
                for( let k=posiTxs.length - 1; k>=0; k--) {

                  if(txsCirculoRojo[i].idTx == posiTxs[k].idTx ){
                    
                    posiTxs.splice(k, 1);
                    break;
                    
                  }//fin if(txsCirculoRojo[i].idTx == posiTxs[k].idTx )
                
                }//fin for(let k=0; k<posiTxs.length; k++)
              
              
                //Eliminamos de posiAddrs al revés
                for( let k=posiAddrs.length - 1; k>=0; k--) {

                  if( 
                    (txsCirculoRojo[i].idTx == posiAddrs[k].idTx1) ||
                    (txsCirculoRojo[i].idTx == posiAddrs[k].idTx2)
                  ){
                    
                    posiAddrs.splice(k, 1);
                    
                  }//fin if(txsCirculoRojo[i].idTx == posiTxs[k].idTx )
                
                }//fin for(let k=0; k<posiAddrs.length; k++)

                
            }//fin de if ( distanciaRatonCentrocirculo <= txsCirculoRojo[i].radio 

            myBchain.dibujaTxsAddrs();
      
        }//fin for(let i=0; i<txsCirculoRojo.length; i++)
      
      
    }//fin  eliminaTxAddr()
    
    circuloParaEliminar()                                   {
     

        if(marcaParaEliminar){

        
          push();
      
          txsCirculoRojo  = Array();
          angleMode(DEGREES);
      
          let colorBlanco = color(255, 255, 255);
          let colorRojo   = color(255, 0, 0);
          
      
          let centroCirculoRojo;
      
          for(let i=0; i<posiTxs.length; i++) {
      
            centroCirculoRojo = createVector( posiTxs[i].x + anchoTx, posiTxs[i].y );
      
            fill(colorRojo);
            strokeWeight(0);
            ellipse(centroCirculoRojo.x, centroCirculoRojo.y , radioCirculoRojo, radioCirculoRojo);
      
            //ASPAS
            stroke(colorBlanco);
            strokeWeight(3);
      
            translate(centroCirculoRojo.x , centroCirculoRojo.y);
            rotate( 45 );
      
            line ( -radioCirculoRojo/2 , 0 ,  radioCirculoRojo/2 , 0  );
            line ( 0 , -radioCirculoRojo/2 , 0 ,  radioCirculoRojo/2  );
      
            rotate( -45 );
            translate(-centroCirculoRojo.x , -centroCirculoRojo.y);
      
            //Grabar en array para luego borrarlas
            txsCirculoRojo.push({    
                                  'idTx'      : posiTxs[i].idTx ,    
                                  'x'         : centroCirculoRojo.x,  
                                  'y'         : centroCirculoRojo.y , 
                                  'radio'     : radioCirculoRojo     
                                });
      
          }//fin for(let i=0; i<posiTxs.length; i++) 
      
          pop();

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();           
      
        }// fin if(marcaParaEliminar)
      
    }//fin  circuloParaEliminar(

    muestraOcultaElimina()                                  {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();

        //Si vamos a eliminar primero quitamos recuadro rojo de seleccionar
        if (txsSeleccionados.length > 0 ){
            
            for(let i=0; i<txsSeleccionados.length; i++) {
            
                let txParaDeselec   = txsSeleccionados[i];
                let idTxDeselec     = posiTxs.findIndex(posiTxs => posiTxs.idTx === txParaDeselec);
                posiTxs[idTxDeselec].color  = {'r':77,  'g':77,  'b':77};
                posiTxs[idTxDeselec].weight = 2;

            }//fin for(let i=0; i<txsSeleccionados.length; i++

            txsSeleccionados  = Array();

            botonSelec.html('selec.');

        }// fin if (txsSeleccionados.length > 0 )
        

        if(marcaParaEliminar){
            marcaParaEliminar = false;
            myBchain.dibujaTxsAddrs();

        }else{
            marcaParaEliminar = true;
            myBchain.dibujaTxsAddrs();

        }//finif(marcaParaEliminar

    }//fin muestraOcultaElimina

    muestraOcultaLineas()                                   {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();

        if(mostarLineas){
            botonLineas.html('sin alin.');
            mostarLineas = false;
            myBchain.dibujaTxsAddrs();

        }else{
            botonLineas.html('alinear');
            mostarLineas = true;
            myBchain.dibujaTxsAddrs();

        }//fin if(mostarLineas

    }//fin muestraOcultaLineas

    muestraOcultaInfo()                                     {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();

        if(mostrarInfo){
            botonInfo.html('sin info.');
            mostrarInfo = false;
            myBchain.dibujaTxsAddrs();

        }else{
            botonInfo.html('con info.');
            mostrarInfo = true;
            myBchain.dibujaTxsAddrs();

        }//fin if(mostrarInfo

    }//fin muestraOcultaInfo

    desactivaDraw()                                         {
        estadoMoviendoTx      = false;  

        myBchain.mueveFueraColorTag();

    }//fin desactivaDraw()

    rayado()                                                {

        let paso = 50;
        let anchoTxt;

        push();

        fill(77, 77, 77);
        stroke(100);
        strokeWeight(0.3);

        textSize(12);

        //Vertical
        for(let i=0; i<windowWidth ; i= i + paso) {
            anchoTxt = textWidth(i) / 2;
            if (i>0) text(i, i-anchoTxt, 14);
            line(i, 25 , i, windowHeight);
        }//fin for(let i=0; i<windowWidth ; i= i + paso)
        //Horizontal
        for(let i=0; i<windowHeight ; i=i + paso) {
            if (i>0) text(i, 2, i+5);    
            line(33, i, windowWidth , i);
        }//fin for(let i=0; i<windowHeight ; i=i + paso

        fill(0);

        pop();
    

    }// fin rayyado

    sombra(profundidad, blur)                               {
        
        drawingContext.shadowOffsetX    = profundidad;
        drawingContext.shadowOffsetY    = -profundidad;
        drawingContext.shadowBlur       = blur;
        drawingContext.shadowColor      = 'black';

    }//fin sombra 

    ventanaPie()                                            {

        
        fill(255);

        //Ventana del pie Canvas
        ventanaPie                       = new Ventana();
        ventanaPie.ancho                 = windowWidth-75;
        ventanaPie.alto                  = 30;

        ventanaPie.x                     = 40;
        ventanaPie.y                     = windowHeight - 95;
        
        ventanaPie.margen                = {'arriba' : 2 , 'abajo' : 2 , 
                                            'izq'    : 2 , 'dere'  : 2 };
        ventanaPie.transparenciaVentana  = 255;
        ventanaPie.tranparenciaMargen    = 123;
        ventanaPie.brillo                = 250;
        ventanaPie.redondeo              = 5;
        ventanaPie.sombra                = true;

        ventanaPie.update();
        ventanaPie.display();

        //Botonera
        let entreBotones = 10;
        let anchoBoton   = 80;
        let xBoton;

        xBoton           = ventanaPie.x  + 30;

        botonRayado.position( xBoton ,  ventanaPie.y + 54 );
        botonRayado.mousePressed(this.muestraOcultaRayado);
        xBoton   += anchoBoton + entreBotones;

        botonSelec.position( xBoton ,  ventanaPie.y + 54 );
        botonSelec.mousePressed(this.selectUnselectTxs);
        xBoton   += anchoBoton + entreBotones;

        botonCentra.position( xBoton ,  ventanaPie.y + 54 );
        botonCentra.mousePressed(this.centrarTxsAddrs);      
        xBoton   += anchoBoton + entreBotones;  

        botonSombra.position( xBoton ,  ventanaPie.y + 54 );
        botonSombra.mousePressed(this.muestraOcultaSombra);  
        xBoton   += anchoBoton + entreBotones;  
        
        botonElimina.position( xBoton ,  ventanaPie.y + 54 );
        botonElimina.mousePressed(this.muestraOcultaElimina);  
        xBoton   += anchoBoton + entreBotones;      
        
        botonLineas.position( xBoton ,  ventanaPie.y + 54 );
        botonLineas.mousePressed(this.muestraOcultaLineas); 
        xBoton   += anchoBoton + entreBotones; 

        botonInfo.position( xBoton ,  ventanaPie.y + 54 );
        botonInfo.mousePressed(this.muestraOcultaInfo); 
        xBoton   += anchoBoton + entreBotones; 

        textTx.position( xBoton ,  ventanaPie.y + 23 );
        xBoton   += 20 + entreBotones;

        sliderTx.position( xBoton ,  ventanaPie.y + 62 );
        sliderTx.input(this.putDimTx);  
        xBoton   += 90 + entreBotones;
        
        textAddr.position( xBoton ,  ventanaPie.y + 23 );
        xBoton   += 40 + entreBotones;

        sliderAddr.position( xBoton ,  ventanaPie.y + 62 );
        sliderAddr.input(this.putDimAddr);  
        xBoton   += 90 + entreBotones;
        
        botonImprimir.position( xBoton ,  ventanaPie.y + 54 );
        botonImprimir.mousePressed(this.imprimeCanvas); 
        xBoton   += anchoBoton + entreBotones; 

        botonVideo.position( xBoton ,  ventanaPie.y + 54 );
        botonVideo.mousePressed(this.controlesGrabaVideo); 
        xBoton   += anchoBoton + entreBotones;

        botonSave.position( xBoton ,  ventanaPie.y + 54 );
        botonSave.mousePressed(this.saveRecuperaDatosTx); 
        xBoton   += anchoBoton + entreBotones;

    }//fin ventanaPie()

    saveRecuperaDatosTx()                                   {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();  

        myBchain.saveJSON();

    }//fin saveRecuperaDatosTx

    controlesGrabaVideo()                                   {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();  

      if (muestraVideo) {
        myBchain.dibujaTxsAddrs();
        document.getElementsByClassName("p5c-container")[0].style.visibility = 'visible';
        document.getElementsByClassName("p5c-container")[0].style.top  = '640px';
        document.getElementsByClassName("p5c-container")[0].style.left = '1080px';        
        muestraVideo = false;
      } else {
        document.getElementsByClassName("p5c-container")[0].style.visibility = 'hidden';
        myBchain.dibujaTxsAddrs();
        muestraVideo=true;
      }//fin   if (muestraVideo)  

    }//fin controlesGrabaVideo

    imprimeCanvas()                                         {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();  

        muestraPie        = false;
        myBchain.dibujaTxsAddrs();
    
        let today = new Date();
        let date = today.getDate()  + '-' + (today.getMonth()+1)+ '-' + (today.getFullYear()).toString().substr(-2)+' ' +
                   today.getHours() + ":" +  today.getMinutes() + ":" + today.getSeconds();
    
        saveCanvas(canvas, date+ ' ' + idTx, 'png');
    
        muestraPie        = true;
        myBchain.dibujaTxsAddrs();

    }//fin imprimeCanvas

    putDimTx()                                              {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();      
        myBchain.mueveFueraColorTag();  

        anchoTx             = sliderTx.value();
        altoTx              = int(anchoTx / 2);


        for(let i=0; i<posiTxs.length; i++) {
            // posiTxs[i].xCentro  -= difX;
            // posiTxs[i].yCentro  -= difY;
            posiTxs[i].xCentro  = int(posiTxs[i].x + (anchoTx / 2));
            posiTxs[i].yCentro  = int(posiTxs[i].y + (altoTx  / 2));

            myBchain.recalculaZoomTxAddr( posiTxs[i], i );

        }//fin

        myBchain.dibujaTxsAddrs();

    }//fin putDimTx

    putDimAddr()                                            {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();  
        myBchain.mueveFueraColorTag();

        radioSatelites = sliderAddr.value();

        //Tratamos las Txs que se han pinchado (doubleclick)
        for(let i=0; i<txsPulsadas.length; i++) {

            //OJO si ya se ha movido no mover el angulo solo el radio
            myBchain.putTxsAddrs (txsPulsadas[i]);
          
        }// fin de for(let i=0; i<txsPulsadas.length; i++
          
          
        myBchain.dibujaTxsAddrs();

    }//fin putDimAddr    

    muestraOcultaRayado()                                   {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();

        if(mostrarRayado){
            mostrarRayado = false;
            myBchain.dibujaTxsAddrs();

        }else{
            mostrarRayado = true;
            myBchain.dibujaTxsAddrs();

        }//finif(mostrarRayado
        
    }//fin muestraOcultaRayado

    muestraOcultaSombra()                                   {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();

        if(mostrarSombra){
            mostrarSombra = false;
            myBchain.dibujaTxsAddrs();

        }else{
            mostrarSombra = true;
            myBchain.dibujaTxsAddrs();

        }//finif(mostrarSombra
        
    }//fin muestraOcultaSombra    

    centrarTxsAddrs()                                       {

        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();

        maxMinTx = myBchain.calculaMaxMinTx(); 
        myBchain.centraPosiTxs(); 

        for(let i=0; i<posiTxs.length; i++) {
            myBchain.recalculaZoomTxAddr( posiTxs[i], i );
        }//fin

        myBchain.dibujaTxsAddrs();

    }//fin centrarTxsAddrs

    muestraVentanaInfoTx (miTx, i)                          {

        let anchoLiterales;
        let numeroLineas  ;
        let paso          ;
        let posiY         ;
        let anchoVentana  ;
        let altoVentana   ;
        let anchoCanvas   ;
        let altoCanvas    ;
        let sobrepasaAncho;
        let sobrepasaAlto ;
        let tipoTx;
        let numMaxLineas;

   
        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();


        anchoLiterales  = 70;
        numeroLineas    = 1;
        paso            = 20;
        posiY           = paso + 5;    

        numMaxLineas    = 10;
        
        //Es una tx normal o una Multi Txs: NN - 
        tipoTx          = 'normal';
        if( miTx.substring(0,5) == 'Multi'){
            tipoTx = 'multiTx';
        }//fin if( miTx.substring(0,5) == 'Multi'


        if (tipoTx == 'normal'){
            //Calculamos el número líneas para mostrar en ventana
            //if( posiTxs[i].blockHeight  > 0 ) numeroLineas++;
            if( posiTxs[i].value        > 0 ) numeroLineas++;
            if( posiTxs[i].numVin       > 0 ) numeroLineas++;
            if( posiTxs[i].numVout      > 0 ) numeroLineas++;
            //if( posiTxs[i].blockTime    > 0 ) numeroLineas++;
            if( posiTxs[i].fees         > 0 ) numeroLineas++;

            anchoVentana        = anchoLiterales + textWidth( miTx )+ (2 * paso)  ;

        }else if (tipoTx == 'multiTx'){
            anchoLiterales = 10;
            //Calcular  num líneas en función de nº txs
            if(posiTxs[i].multiTxs.length + 1 > numMaxLineas ){
                numeroLineas = numMaxLineas + 3;
            }else{
                numeroLineas = posiTxs[i].multiTxs.length + 1;
            }//fin  if(posiTxs[i].multiTxs.length + 1 > numMaxLine

            anchoVentana        = anchoLiterales + textWidth( posiTxs[i].multiTxs[0] )+ (2 * paso)  ;

        }//fin if (tipoTx == 'normal')

        //Si solo hay una línea no mostramos ventana
        //////if( numeroLineas == 1 )return;

      
        
        altoVentana         = posiY + (paso * numeroLineas);
        
        anchoCanvas         = windowWidth   - margenCanvas.der;
        altoCanvas          = windowHeight  - margenCanvas.pie;

        sobrepasaAncho      = (mouseX + anchoVentana) - anchoCanvas + 20;
        if(sobrepasaAncho > 0){
          myVentana.x       = mouseX - sobrepasaAncho;
        }else{
          myVentana.x       = mouseX;
        }//fin if(sobrepasaAncho > 0)

        sobrepasaAlto   = (mouseY + altoVentana) - altoCanvas + 50;
        if(sobrepasaAlto > 0){
          myVentana.y       = mouseY - sobrepasaAlto;
        }else{
          myVentana.y       = mouseY;
        }//fin if(sobrepasaAlto > 0)  
      
        myVentana.ancho     = anchoVentana;
        myVentana.alto      = altoVentana;
      
        myVentana.margen = {'arriba' : 10 , 'abajo' : 7 , 'izq' : 7 , 'dere' : 7 };
        myVentana.transparenciaVentana  = 240;
        myVentana.tranparenciaMargen    = 120;
        myVentana.redondeo = 3;
        myVentana.sombra = false;


        myVentana.update();
        myVentana.display();
      
        fill(myVentana.colorTexto);
        textFont('Roboto');
      
        if((posiTxs[i].idTx).substring(0,5) == 'Multi'){
            text ('      ' ,                        myVentana.x + paso,                     myVentana.y + posiY );
            //anchoLiterales -= 70;
        }else{
            text ('TXID: ' ,                        myVentana.x + paso,                     myVentana.y + posiY );
        }//fin 
        text (posiTxs[i].idTx ,                 myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );
        posiY = posiY + paso;


        if (tipoTx == 'normal'){

            // if( posiTxs[i].blockHeight   > 0 ){
            //     text ('BLOCK: ' ,                   myVentana.x + paso,                     myVentana.y + posiY );
            //     text ((posiTxs[i].blockHeight).toLocaleString("es-ES") , 
            //                                         myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );            
            //     posiY = posiY + paso;

            // }//fin if( posiTxs[i].blockHeight   > 0

            if( posiTxs[i].value   > 0 ){
                text ('VALOR: ' ,                   myVentana.x + paso,                     myVentana.y + posiY );
                text (int(posiTxs[i].value).toLocaleString("es-ES") , 
                                                    myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );            
                posiY = posiY + paso;

            }//fin if( posiTxs[i].value   > 0  

            // if( posiTxs[i].blockTime  > 0 ){
            //     text ('TIME: ' ,                    myVentana.x + paso,                    myVentana.y + posiY );
            //     text (myTime(posiTxs[i].blockTime), myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
            //     posiY = posiY + paso;

            // }//fin if( posiTxs[i].blockTime   > 0  

            if( posiTxs[i].fees  > 0 ){
                text ('FEES: ' ,                 myVentana.x + paso,                    myVentana.y + posiY );
                text (int(posiTxs[i].fees).toLocaleString("es-ES") , 
                                                 myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
                posiY = posiY + paso;

            }//fin if( posiTxs[i].fees   > 0  

            if( posiTxs[i].numVin  > 0 ){
                text ('#INPUTS: ' ,                  myVentana.x + paso,                    myVentana.y + posiY );
                text (posiTxs[i].numVin ,            myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
                posiY = posiY + paso;

            }//fin if( posiTxs[i].numVin   > 0   

            if( posiTxs[i].numVout  > 0 ){
                text ('#OUTPUTS: ' ,                 myVentana.x + paso,                    myVentana.y + posiY );
                text (posiTxs[i].numVout ,           myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
                posiY = posiY + paso;

            }//ffin if( posiTxs[i].numVout   > 0  

        }else if (tipoTx == 'multiTx'){
             //Mostrar los 10 primeros TXs del addr que lo une al padre
             //anchoLiterales = 10;
             for(let j=0; j<posiTxs[i].multiTxs.length; j++) {

                text (posiTxs[i].multiTxs[j] ,           myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
                posiY = posiY + paso;

                if (j > 9){
                    text ('.......' ,           myVentana.x + paso + anchoLiterales,   myVentana.y + posiY );            
                    posiY = posiY + paso;
                    break;
                }//fin if (j > 9)
               
             }// fin de for(let j=0; j<posiTxs[i].multiTxs.length
               
               

        }//fin if (tipoTx == 'normal')

 

    }//fin  muestraVentanaInfoTx    

    muestraVentanaInfoAddr (miAddr, i)                      {

        let anchoLiterales;
        let numeroLineas  ;
        let paso          ;
        let posiY         ;
        let anchoVentana  ;
        let altoVentana   ;
        let anchoCanvas   ;
        let altoCanvas    ;
        let sobrepasaAncho;
        let sobrepasaAlto ;

   
        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();


        anchoLiterales  = 70;
        numeroLineas    = 1;
        paso            = 20;
        posiY           = paso + 5;        

        //Calculamos el número líneas para mostrar en ventana
        if( posiAddrs[i].value   > 0  ) numeroLineas++;

        
        anchoVentana        = anchoLiterales + textWidth( miAddr )+ (2 * paso)  ;
        altoVentana         = posiY + (paso * numeroLineas);
        
        anchoCanvas         = windowWidth   - margenCanvas.der;
        altoCanvas          = windowHeight  - margenCanvas.pie;

        sobrepasaAncho      = (mouseX + anchoVentana) - anchoCanvas + 20;
        if(sobrepasaAncho > 0){
          myVentana.x       = mouseX - sobrepasaAncho;
        }else{
          myVentana.x       = mouseX;
        }//fin if(sobrepasaAncho > 0)

        sobrepasaAlto   = (mouseY + altoVentana) - altoCanvas + 50;
        if(sobrepasaAlto > 0){
          myVentana.y       = mouseY - sobrepasaAlto;
        }else{
          myVentana.y       = mouseY;
        }//fin if(sobrepasaAlto > 0)  
      
        myVentana.ancho     = anchoVentana;
        myVentana.alto      = altoVentana;
      
        myVentana.margen = {'arriba' : 10 , 'abajo' : 7 , 'izq' : 7 , 'dere' : 7 };
        myVentana.transparenciaVentana  = 240;
        myVentana.tranparenciaMargen    = 120;
        myVentana.redondeo = 3;
        myVentana.sombra = false;
        
        myVentana.update();
        myVentana.display();
      
        fill(myVentana.colorTexto);
        textFont('Roboto');
      
        
        text ('ADDRID: ' ,                        myVentana.x + paso,                     myVentana.y + posiY );
        text (posiAddrs[i].idAddr ,               myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );
        posiY = posiY + paso;

        if( posiAddrs[i].value   > 0 ){
            text ('VALOR: ' ,                   myVentana.x + paso,                     myVentana.y + posiY );
            text (int(posiAddrs[i].value).toLocaleString("es-ES") ,          
                                                myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );            
            posiY = posiY + paso;

        }//fin if(posiAddrs[i].value) > 0        
 
      
    }//fin  muestraVentanaInfoAddr   

    muestraVentanaInfoHeuris (miTx, i)                      {

        let anchoLiterales;
        let numeroLineas  ;
        let paso          ;
        let posiY         ;
        let anchoVentana  ;
        let altoVentana   ;
        let anchoCanvas   ;
        let altoCanvas    ;
        let sobrepasaAncho;
        let sobrepasaAlto ;

        //Si es una Multi Txs: NN - no hay Info
        if( miTx.substring(0,5) == 'Multi'){
            return;   //No se muestra ventana de Info
        }//fin if( miTx.substring(0,5) == 'Multi'


        //Ocultamos ventana de ayuda
        mostrandoAyuda      = false;
        ayudaVentana.oculta();
        myBchain.mueveFueraColorTag();


        anchoLiterales  = 70;
        numeroLineas    = 1;
        paso            = 20;
        posiY           = paso + 5;    


        //Calculamos el número líneas para mostrar en ventana
        if( posiTxs[i].heuristic[0] ) numeroLineas++;
        if( posiTxs[i].heuristic[1] ) numeroLineas++;
        if( posiTxs[i].heuristic[2] ) numeroLineas++;
        if( posiTxs[i].heuristic[3] ) numeroLineas++;
        if( posiTxs[i].heuristic[4] ) numeroLineas++;
        if( posiTxs[i].heuristic[5] ) numeroLineas++;
        if( posiTxs[i].heuristic[6] ) numeroLineas++;
        if( posiTxs[i].heuristic[7] ) numeroLineas++;

        anchoVentana        = anchoLiterales + textWidth( miTx )+ (2 * paso)  ;

        altoVentana         = posiY + (paso * numeroLineas);
        
        anchoCanvas         = windowWidth   - margenCanvas.der;
        altoCanvas          = windowHeight  - margenCanvas.pie;

        sobrepasaAncho      = (mouseX + anchoVentana) - anchoCanvas + 20;
        if(sobrepasaAncho > 0){
          myVentana.x       = mouseX - sobrepasaAncho;
        }else{
          myVentana.x       = mouseX;
        }//fin if(sobrepasaAncho > 0)

        sobrepasaAlto   = (mouseY + altoVentana) - altoCanvas + 50;
        if(sobrepasaAlto > 0){
          myVentana.y       = mouseY - sobrepasaAlto;
        }else{
          myVentana.y       = mouseY;
        }//fin if(sobrepasaAlto > 0)  
      
        myVentana.ancho     = anchoVentana;
        myVentana.alto      = altoVentana;
      
        myVentana.margen = {'arriba' : 10 , 'abajo' : 7 , 'izq' : 7 , 'dere' : 7 };
        myVentana.transparenciaVentana  = 240;
        myVentana.tranparenciaMargen    = 120;
        myVentana.redondeo = 3;
        myVentana.sombra = false;


        myVentana.update();
        myVentana.display();
      

        //Texto
        fill(myVentana.colorTexto);
        textFont('Roboto');
      
        
        text ('TXID: ' ,                        myVentana.x + paso,                     myVentana.y + posiY );
        text (posiTxs[i].idTx ,                 myVentana.x + paso + anchoLiterales,    myVentana.y + posiY );
        posiY = posiY + paso;



        if( posiTxs[i].heuristic[0]  ){
            text ('REUTILIZACIÓN DE DIRECCIONES. ' ,                myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;

        }//fin if( posiTxs[i].heuristic[ 

        if( posiTxs[i].heuristic[1]){
            text ('PAGO CON NÚMEROS REDONDOS. ' ,                   myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;

        }//fin if( posiTxs[i].heuristic[

        if( posiTxs[i].heuristic[2]){
            text ('PAGO A DIRECCIONES CON FORMATO DIFERENTE. ' ,     myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;

        }//fin if( posiTxs[i].heuristic[         
               
        if( posiTxs[i].heuristic[3]){
            text ('PAGO USANDO DIRECCIONES TAPROOT. ' ,              myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;

        }//fin if( posiTxs[i].heuristic[  

        if( posiTxs[i].heuristic[4]){
            text ('PAGO A DIRECCIONES CON SCRIPT DIFERENTE. ' ,     myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;
    
        }//fin if( posiTxs[i].heuristic[          

        if( posiTxs[i].heuristic[5]){
            text ('ENTRADA INNECESARIA. ' ,                         myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;
    
        }//fin if( posiTxs[i].heuristic[ 

        if( posiTxs[i].heuristic[6]){
            text ('SALIDA CON EL MONTO MAYOR. ' ,                   myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;
    
        }//fin if( posiTxs[i].heuristic[             

        if( posiTxs[i].heuristic[7]){
            text ('VERSION DE LAS TRANSACCIONES. ' ,                myVentana.x + paso,  myVentana.y + posiY );
            posiY = posiY + paso;
    
        }//fin if( posiTxs[i].heuristic[ 

            

    }//fin  muestraVentanaInfoHeuris 
    
    muestraAyuda( video )                                   {

        videoTrab = sitioVideosAyuda + video;
    

        if( !mostrandoAyuda ){

            mostrandoAyuda                     = true;

            document.getElementById("defaultCanvas0").style.top         = '500px';
            document.getElementById("idDivAyuda").style.visibility      = 'visible';
            document.getElementById("idLiteralAyuda").style.visibility  = 'visible';
            //document.getElementById("idBotonPlay").style.visibility     = 'visible';
            document.getElementById("idBotonAyuda").value               = '< Volver';

            this.muestraOcultaTodosElementos( 'muestra' );
            
            //Parte de la izqda. ayuda
            myBchain.contenidoAyuda( windowWidth - 40, windowHeight - 50 );
            
            //Parte de la drcha. ayuda -> vídeo
            literalAyuda.position(490 , yPantallaVideo - 60 );  

 
            playing         = true;
            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( videoTrab );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.addClass("pantallaVideo");
            pantallaVideo.position(490 , yPantallaVideo );
            pantallaVideo.size(700, 400);
            pantallaVideo.loop();

            botonPlay.html('pausa');
            botonPlay.position(490, yPantallaVideo + 420 );
            botonPlay.mousePressed(this.toggleVid); 
      
      
        } else if( mostrandoAyuda ){

            mostrandoAyuda                      = false;

            divAyuda.position(-20000, -20000);
            document.getElementById("idDivAyuda").style.visibility      = 'hidden';
            document.getElementById("idLiteralAyuda").style.visibility  = 'hidden';
            //document.getElementById("idBotonPlay").style.visibility     = 'hidden';
            document.getElementById("idBotonAyuda").value               = 'Ayuda';

            document.getElementById("defaultCanvas0").style.top         = '50px';
            this.muestraOcultaTodosElementos( 'oculta' );

            pantallaVideo.remove();

            myBchain.dibujaTxsAddrs();            
      
      
        }//fin if( !mostrandoAyuda )
      
      
    }//fin  muestraAyuda()

    muestraAyudaPrimeraPantalla( video )                    {

        videoTrab = sitioVideosAyuda + video;

        mostrandoAyuda   = true;

        literalAyuda.position(canvasInputTx.xCentro - 400,  canvasInputTx.y + 180 );  

        playing          = false;
        if(pantallaVideo) pantallaVideo.remove();
        pantallaVideo    = createVideo( videoTrab );
        pantallaVideo.id("idPantallaVideo");
        pantallaVideo.addClass("pantallaVideo");
        pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
        pantallaVideo.size(710, 400);
        pantallaVideo.pause();

        botonPlay.html('play');
        botonPlay.id('idPlay');
        botonPlay.position(     canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 + 420 );
        botonPlay.mousePressed(this.toggleVid); 

        
        //Botones otros vídeosidBotonAyudaPrimPan
        let yBotones = 250, pasoYBotones = 50;

        botonAyudaPrimPan1 = createButton(  'Desplegar Inputs' ); 
        botonAyudaPrimPan1.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan1.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan1.size(150);
        botonAyudaPrimPan1.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'desplegarInputs.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        }); 
               
        botonAyudaPrimPan2 = createButton(  'Mover Tx' ); 
        botonAyudaPrimPan2.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan2.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan2.size(150);
        botonAyudaPrimPan2.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'moverTx.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        }); 

        botonAyudaPrimPan3 = createButton(  'Zoom Canvas' ); 
        botonAyudaPrimPan3.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan3.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan3.size(150);
        botonAyudaPrimPan3.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'zoomCanvas.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });        
        
        botonAyudaPrimPan4 = createButton(  'Selecciona Tx' ); 
        botonAyudaPrimPan4.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan4.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan4.size(150);
        botonAyudaPrimPan4.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'selecTx.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });   
        
        botonAyudaPrimPan5 = createButton(  'Colorear Tx' ); 
        botonAyudaPrimPan5.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan5.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan5.size(150);
        botonAyudaPrimPan5.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'colorearTx.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });      
        
        botonAyudaPrimPan6 = createButton(  'Etiquetar Tx' ); 
        botonAyudaPrimPan6.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan6.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan6.size(150);
        botonAyudaPrimPan6.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'etiquetarTx.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });         
              
        botonAyudaPrimPan7 = createButton(  'Eliminar Tx' ); 
        botonAyudaPrimPan7.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan7.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan7.size(150);
        botonAyudaPrimPan7.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'marcarDesmarcarEliminarTx.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });    
        
        botonAyudaPrimPan8 = createButton(  'Información' ); 
        botonAyudaPrimPan8.id("idBotonAyudaPrimPan");
        botonAyudaPrimPan8.position(canvasInputTx.xCentro - 570, yBotones);
        yBotones += pasoYBotones;
        botonAyudaPrimPan8.size(150);
        botonAyudaPrimPan8.mousePressed(function(){ 
            playing                     = false;

            if(pantallaVideo) pantallaVideo.remove();
            pantallaVideo    = createVideo( sitioVideosAyuda + 'sinInformacionTxAddr.mp4' );
            pantallaVideo.id("idPantallaVideo");
            pantallaVideo.position( canvasInputTx.xCentro - 400,  canvasInputTx.y + 240 );
            pantallaVideo.size(730, 400);
            pantallaVideo.pause();

            botonPlay.html('play');
        
        });    
                

    }//fin  muestraAyudaPrimeraPantalla()





    muestraOcultaTodosElementos( estado )                   {

        let xyPosicion = -20000;

        if (estado == 'muestra'){

            muestraPie        = false;
            document.getElementById("defaultCanvas0").style.visibility     = 'hidden';
            document.getElementsByClassName("p5c-container")[0].style.visibility = 'hidden';
            

            inputTx.position(xyPosicion, xyPosicion);
            botonBuscar.position(xyPosicion, xyPosicion);
            nombreApp.position(xyPosicion, xyPosicion);
            literalPie.position(xyPosicion, xyPosicion);

            divGifAnimado.position(xyPosicion, xyPosicion);

            botonRayado.position(xyPosicion, xyPosicion);
            botonSelec.position(xyPosicion, xyPosicion);
            botonCentra.position(xyPosicion, xyPosicion);
            botonSombra.position(xyPosicion, xyPosicion);
            botonElimina.position(xyPosicion, xyPosicion);
            botonLineas.position(xyPosicion, xyPosicion);
            botonInfo.position(xyPosicion, xyPosicion);
            botonImprimir.position(xyPosicion, xyPosicion);
            botonVideo.position(xyPosicion, xyPosicion);
            textTx.position(xyPosicion, xyPosicion);
            sliderTx.position(xyPosicion, xyPosicion);
            textAddr.position(xyPosicion, xyPosicion);
            sliderAddr.position(xyPosicion, xyPosicion);

            


        }else if (estado == 'oculta'){

            pantallaVideo.position(xyPosicion ,  xyPosicion);
            botonPlay.position(xyPosicion ,  xyPosicion);
            literalAyuda.position(xyPosicion ,  xyPosicion);
            document.getElementById("defaultCanvas0").style.visibility     = 'visible';

            muestraPie        = true;
            document.getElementById("defaultCanvas0").style.visibility     = 'visible';
            // divAyudaVideo.position(xyPosicion, xyPosicion); 
            
            

        }//fin muestraOcultaTodosElementos( estado )

    }//fin muestraOcultaTodosElementos

    mueveFueraColorTag()                                    {

        let posicion = 2000;
      
        buttonColor1.position(-posicion, -posicion);
        buttonColor2.position(-posicion, -posicion);
        buttonColor3.position(-posicion, -posicion);
        buttonColor4.position(-posicion, -posicion);
        buttonColor5.position(-posicion, -posicion);
        buttonColor6.position(-posicion, -posicion);
        buttonColor7.position(-posicion, -posicion);
      
        buttonTag.position   (-posicion, -posicion);
        inputTags.position   (-posicion, -posicion);
      
    }//fin  mueveFueraColorTag()

    recalculaXYAddrs()                                      {
  
  
        for(let i=0; i<posiAddrs.length; i++) {
          
          let idTx1 = posiAddrs[i].idTx1;
          let idTx2 = posiAddrs[i].idTx2;
      
          for(let j=0; j<posiTxs.length; j++) {
      
              //Si encontramos el idTx en posiTxs tomamos el centro
              if (posiTxs[j].idTx == idTx1){
                  posiAddrs[i].x1     = posiTxs[j].xCentro ;
                  posiAddrs[i].y1     = posiTxs[j].yCentro ;
              }//fin de if (posiTxs[i].tx == idTx1 
              
              if (posiTxs[j].idTx == idTx2){
                  posiAddrs[i].x2     = posiTxs[j].xCentro ;
                  posiAddrs[i].y2     = posiTxs[j].yCentro ;
              }//fin de if (posiTxs[i].tx == idTx2     
    
              //Zoom ancho del Addr
              posiAddrs[i].ancho = anchoTx * 0.05;
              
          }//fin for(let j=0; j<posiTxs.length; j++
    
      
        }//fin for(let i=0; i<posiAddrs.length; i++)
      
        return 1;
      
    }//fin  recalculaXYAddrs()

    centraPosiTxs()                                         {

        let mueveX = maxMinTx.xCentro - dimCanvas.xCentro;
        let mueveY = maxMinTx.yCentro - dimCanvas.yCentro;
      
      
        for(let i=0; i<posiTxs.length; i++) {
          //Calculamos x e y de la nueva Tx
          posiTxs[i].x = posiTxs[i].x - mueveX;
          posiTxs[i].y = posiTxs[i].y - mueveY;
      
          //Calculamos el centro de la nueva Tx
          posiTxs[i].xCentro     = int(posiTxs[i].x + (anchoTx / 2)) ;
          posiTxs[i].yCentro     = int(posiTxs[i].y + (altoTx  / 2)) ;

        }//fin for(let i=0; i<posiTxs.length; i++) 
      
    }//fin  centraPosiTxs

    calculaMaxMinTx()                                       {

        let maxMinTx        = { 'minX'    :999999999 , 'maxX'    : 0, 
                                'minY'    :999999999 , 'maxY'    : 0, 
                                'xCentro' : 0,         'yCentro' : 0 };
      
        for(let i=0; i<posiTxs.length; i++) {
      
          if(posiTxs[i].x < maxMinTx.minX ){
            maxMinTx.minX = posiTxs[i].x;
          }//fin if(posiTxs[i].x < maxMinTx.minX
          if(posiTxs[i].y < maxMinTx.minY ){
            maxMinTx.minY = posiTxs[i].y;
          }//fin if(posiTxs[i].y < maxMinTx.minY
          if(posiTxs[i].x + anchoTx > maxMinTx.maxX ){
            maxMinTx.maxX = posiTxs[i].x + anchoTx;
          }//fin if(posiTxs[i].x + posiTxs[i].ancho > maxMinTx.maxX
          if(posiTxs[i].y + altoTx > maxMinTx.maxY ){
            maxMinTx.maxY = posiTxs[i].y + altoTx;
          }//fin if(posiTxs[i].y + posiTxs[i].alto > maxMinTx.maxY
      
        }//fin for(let i=0; i<posiTxs.length; i++) 
      
        //Calculamos el centro del maxMinTx
        maxMinTx.xCentro     = int(maxMinTx.minX + ((maxMinTx.maxX - maxMinTx.minX )  / 2));
        maxMinTx.yCentro     = int(maxMinTx.minY + ((maxMinTx.maxY - maxMinTx.minY )  / 2)) ;
      
        return maxMinTx;
      
    }//fin  calculaMaxMinTx()

    dibujaLineasCentrado(idTxEnMovimiento)                  {

        let margen = 3;

        let txMoviendo = posiTxs[idTxEnMovimiento];
      
        let xCentroTxMoviendo = int(txMoviendo.xCentro);
        let yCentroTxMoviendo = int(txMoviendo.yCentro);
      
        let lineColor  = color(255, 255, 255);
      
        push();
      
        lineColor.setAlpha(200);
        stroke(lineColor);
      
        for(let i=0; i<posiTxs.length; i++) {
      
          //Línea vertical
          if ((int(posiTxs[i].xCentro) < xCentroTxMoviendo + margen ) &&
              (int(posiTxs[i].xCentro) > xCentroTxMoviendo - margen ) &&
              ( xCentroTxMoviendo != int(posiTxs[i].yCentro ))) {
      
            line(
                    xCentroTxMoviendo, posiTxs[i].yCentro, 
                    xCentroTxMoviendo, txMoviendo.yCentro
                );
          
          }//fin if (int(posiTxs[i].xCentro) == xCentroTxMoviendo
      
          //Línea horizontal
          if ( (int(posiTxs[i].yCentro) < yCentroTxMoviendo + margen) &&
               (int(posiTxs[i].yCentro) > yCentroTxMoviendo - margen) &&
               ( yCentroTxMoviendo != int(posiTxs[i].xCentro) )){
      
            line(
                    posiTxs[i].xCentro, yCentroTxMoviendo,
                    txMoviendo.xCentro, yCentroTxMoviendo
                );      
            
          }//fin  if (int(posiTxs[i].yCentro) == yCentroTxMoviendo
      
        }//fin for(let i=0; i<posiTxs.length; i++)
      
        pop();
      
    }//fin  dibujaLineasCentrado(txMoviendo)

    informacionTxAddr()                                     {

        //if ((movedX == 0) && (movedY == 0) ) return 0;

        //Tx 
        //////////////////////////////////////////////////////////////////////
        let idTxOver, encontradoTx = false, encontradoHeuris = false;

        //Esta dentro cuadro de Tx
        for(let i=0; i<posiTxs.length; i++) {

          //Esta dentro semaforos heuristica
          idTxOver = myBchain.estaDentroHeuris ( posiTxs[i] );
          if ( idTxOver ){

            myBchain.dibujaTxsAddrs();
            
            //Muestra ventana con INFO de Tx
            myBchain.muestraVentanaInfoHeuris (idTxOver , i);           

            encontradoHeuris = true;

            return idTxOver;

          }//fin if ( idTxOver )    


          idTxOver = myBchain.estaDentroTx ( posiTxs[i] );
          if ( idTxOver ){

            myBchain.dibujaTxsAddrs();
            
            //Muestra ventana con INFO de Tx
            myBchain.muestraVentanaInfoTx (idTxOver , i);           

            encontradoTx = true;

            return idTxOver;

          }//fin if ( idTxOver )


        }// fin de for(let i=0; i<posiTxs.length; i++)  


        //Addr
        //////////////////////////////////////////////////////////////////////
        let idAddrOver,  encontradoAddr = false;;

        for(let i=0; i<posiAddrs.length; i++) {

          idAddrOver = myBchain.estaDentroAddr ( posiAddrs[i] );
          if ( idAddrOver ){
    
            myBchain.dibujaTxsAddrs();

            //Muestra ventana con INFO de Tx
            myBchain.muestraVentanaInfoAddr (idAddrOver , i);

            encontradoAddr = true;

            return idAddrOver;

          }//fin if ( idAddrOver )

        }// fin de for(let i=0; i<posiTxs.length; i++)  
    

        if(!encontradoTx && !encontradoAddr && !encontradoHeuris ) return 0;


    }//fin informacionTxAddr()

    txsDentroArea()                                         {

        let idTxSeleccionado;
        let anchoArea = abs(mouseXFin - mouseXIni);
        let altoArea  = abs(mouseYFin - mouseYIni);


        for(let i=0; i<posiTxs.length; i++) {

            //Intersección Tx con área
            if (  this.intersection(
                        { x: posiTxs[i].x,  y: posiTxs[i].y,    width: anchoTx, height: altoTx },
                        { x: mouseXIni, y: mouseYIni, width: anchoArea, height: altoArea }
               )){

                //Está dentro

                //Ocultamos ventana de ayuda
                mostrandoAyuda      = false;
                ayudaVentana.oculta();

                idTxSeleccionado = posiTxs[i].idTx;


                //Código de línea 600 => shiftKey -> SELECCIONA
                let seleElemen = txsSeleccionados.indexOf( idTxSeleccionado );

                if ( seleElemen == -1 ){ 
                  txsSeleccionados.push(idTxSeleccionado);
                  posiTxs[i].color  = {'r':255,  'g':77,  'b':77};
                  posiTxs[i].weight = 4;
                
                } else {
                  txsSeleccionados.splice( seleElemen, 1 );
                  posiTxs[i].color  = {'r':77,  'g':77,  'b':77};
                  posiTxs[i].weight = 2;
                
                }//fin if (!seleElemen)
            
                if(txsSeleccionados.length > 0){
                  botonSelec.html('unSelec.');
                }else{
                  botonSelec.html('selec.');
                
                }//fin if(txsSeleccionados.length > 0
            
                myBchain.dibujaTxsAddrs();                


            }//fin if (  intersection(


        }//fin for(let i=0; i<posiTxs.length; i++
            

    }//fin  txsDentroArea()

    intersection(rect1, rect2)                              {
        let x1 = rect2.x, y1 = rect2.y, x2 = x1+rect2.width, y2 = y1+rect2.height;

        if (rect1.x > x1) { x1 = rect1.x; }
        if (rect1.y > y1) { y1 = rect1.y; }
        if (rect1.x + rect1.width < x2) { x2 = rect1.x + rect1.width; }
        if (rect1.y + rect1.height < y2) { y2 = rect1.y + rect1.height; }

        return (x2 <= x1 || y2 <= y1) ? false : { x: x1, y: y1, width: x2-x1, height: y2-y1 };
    
    }//fin function intersection(rect1, rect2)

    toggleVid()                                             {
        if (playing) {
            pantallaVideo.pause();
            botonPlay.html('play');
            
        } else {
            pantallaVideo.loop();
            botonPlay.html('pausa');
    
        }//fin  if (playing)
    
        playing = !playing;
    
    }//fin  toggleVid()    

    getHeuristic(vin , vout)                                {

        let arrResul = Array(false,false,false,false,false,false,false,false);
//console.log(vin);
    
        //OJO parche para que se muestren heurísticas
        if(vin[0].isAddress){

            myHeuristic.inputs  = vin;
            myHeuristic.out     = vout;
            arrResul[0] = myHeuristic.reutilizaDirecciones();
            arrResul[1] = myHeuristic.pagoNumeroRedondo();
            arrResul[2] = myHeuristic.pagoFormatoDiferente();
            arrResul[3] = myHeuristic.pagoUsandoTaproot();
            arrResul[4] = myHeuristic.pagoADirScripDif();
            arrResul[5] = myHeuristic.entradaInnecesaria();
            arrResul[6] = myHeuristic.salidaMontoMayor();
            arrResul[7] = myHeuristic.versionesDeTxs();

        }//fin if(vin.isAddress

        return arrResul;

    }//fin getHeuristic(vin , vout)


    ////////////////////////////////////////////////////////////////////////////////////////
    //Métodos Privados
    ////////////////////////////////////////////////////////////////////////////////////////
    #isInArbolTxsAddrs ( valor1, valor2, valor3 )           {
        for(let i=0; i<arbolTxsAddrs.length; i++) {
            if (( arbolTxsAddrs[i].rama[0] == valor1 ) && 
                ( arbolTxsAddrs[i].rama[1] == valor2 ) && 
                ( arbolTxsAddrs[i].rama[2] == valor3 )  
            ){
                return true;
            }//fin if (arbolTxsAddrs[i].rama[0] == valor1

        }//fin for(let i=0; i<arbolTxsAddrs.length; i++)

        return false

    }//fin #isInArbolTxsAddrs (   valor1, valor2, valor3 

    #isInPosiTxs ( valor1 )                                 {
        for(let i=0; i<posiTxs.length; i++) {
            if ( posiTxs[i].idTx == valor1 ){
                return true;
            }//fin if (arrayObjetos[i].campoABuscar != valorAB
        }//fin for(let i=0; i<arrayObjetos.length; i++)

        return false

    }//fin #isInPosiTxs (  campoABuscar, valorABuscar 

    #isInPosiAddrs ( valor1, valor2, valor3 )               {
        for(let i=0; i<posiAddrs.length; i++) {
            if (( posiAddrs[i].idAddr == valor1 ) && 
                ( posiAddrs[i].idTx1  == valor2 ) && 
                ( posiAddrs[i].idTx2  == valor3 )  
            ){
                return true;
            }//fin if (posiAddrs[i].rama[0] == valor1

        }//fin for(let i=0; i<posiAddrs.length; i++)

        return false

    }//fin #isInPosiAddrs (   valor1, valor2, valor3 )

    #acortaIdTx (idTx)                                      {

        //return idTx.substring(0, 4);
        return idTx.substring(0, 4) + '-' + idTx.substring(idTx.length - 4);
    
    }//fin  #acortaIdTx (idTx



    ////////////////////////////////////////////////////////////////////////////////////////
    //Para Versión 2
    ////////////////////////////////////////////////////////////////////////////////////////
    V_2_intersecionTxs()                                    {

        let txPulsado, txSatelite, txIntersec;
        let indiceSatelite, indiceIntersec;
        let posiSatelite, posiIntersec;
        let rectSatelite = {}, rectIntersec = {};
        let resultIntersec;
        let sinIntersec = false;
        let numeroIntersec  = 99;
        let margenSeparacion = 5;
        let ioSatelite;

        while (!sinIntersec ){

            sinIntersec     = true
            numeroIntersec  = 0;

            //Buscamos los Txs pincados -> desplegados
            for(let i=0; i<txsPulsadas.length; i++) {
                txPulsado                   = txsPulsadas[i];

                //Buscamos los Txs satélites de los Txs pulsados
                for(let j = 0, len = arbolTxsAddrs.length; j < len; j++) {
                    if ( arbolTxsAddrs[j].rama[0] === txPulsado ) {
                        ioSatelite          = arbolTxsAddrs[j].io;
                        txSatelite          = arbolTxsAddrs[j].rama[2];
                        indiceSatelite      = posiTxs.map(x => x.idTx).indexOf(txSatelite );
                        posiSatelite        = posiTxs[indiceSatelite];
                        rectSatelite        = { x       : posiSatelite.x - margenSeparacion,  
                                                y       : posiSatelite.y - margenSeparacion, 
                                                width   : anchoTx + margenSeparacion ,      
                                                 height : altoTx  + margenSeparacion};
                        // xCentroSatelite     = posiSatelite.xCentro;
                        // yCentroSatelite     = posiSatelite.yCentro;


                        //Buscamos interseccióncon de este Tx (txSatelite) con el resto de Txs
                        for(let k = 0, len = posiTxs.length; k < len; k++) {
                            txIntersec      = posiTxs[k];
                            indiceIntersec  = k;
                            posiIntersec    = posiTxs[indiceIntersec];
                            rectIntersec    = { x       : posiIntersec.x ,  y       : posiIntersec.y , 
                                                width   : anchoTx ,         height  : altoTx };
                            // xCentroIntersec = posiSatelite.xCentro;
                            // yCentroIntersec = posiSatelite.yCentro;
                            
                            
                            // No tratamos un Tx consigo mismo
                            if(indiceSatelite != indiceIntersec){

                                resultIntersec  = this.intersection( rectIntersec , rectSatelite);

                                //Existe intersección
                                if(resultIntersec){

                                    //rect (resultIntersec.x , resultIntersec.y , resultIntersec.width, resultIntersec.height);
                                
                                    if (ioSatelite == 'I'){
                                        posiTxs[indiceSatelite].x           += resultIntersec.width;
                                        posiTxs[indiceSatelite].y           += resultIntersec.height;
                                        posiTxs[indiceSatelite].xCentro     += resultIntersec.width;
                                        posiTxs[indiceSatelite].yCentro     += resultIntersec.height;
                                    }else  {
                                        posiTxs[indiceSatelite].x           += resultIntersec.width;
                                        posiTxs[indiceSatelite].y           += resultIntersec.height;
                                        posiTxs[indiceSatelite].xCentro     += resultIntersec.width;
                                        posiTxs[indiceSatelite].yCentro     += resultIntersec.height;

                                    }//fin 

                                    myBchain.recalculaAddrParaIntersec( posiTxs[indiceSatelite].idTx , indiceSatelite);
                                    myBchain.dibujaTxsAddrs();

                                    sinIntersec = false;
                                    numeroIntersec++;

                                }//fin if(resultIntersec

                            }//fin if(indiceSatelite != indiceIntersec

                        }// fin de for(let k = 0, len = posiTxs.length; k < len; k++

                    }//fin  if ( arbolTxsAddrs[j].rama[0] === txPulsad

                }//fin for(let j = 0, len = arbolTxsAddrs.length; j < len; j++)

            }//fin for(let i=0; i<txsPulsadas.length; i++)

        }// fin while 

        if(sinIntersec) {
            console.log ('Sin intersecciones');
        }


    }//fin intersecionTxs

    V_2_recalculaAddrParaIntersec( txEnMovimiento, idTxEnMovimiento ){

        let xCentroMoviendo, yCentroMoviendo;


        ///////////////////////////////////////////////////////////////////////
        //posiTxs
        ///////////////////////////////////////////////////////////////////////
        //Reposicionamos x, y, centro del Tx
        // posiTxs[idTxEnMovimiento].x         += int( mouseX - mouseXIni );
        // posiTxs[idTxEnMovimiento].y         += int( mouseY - mouseYIni );

        xCentroMoviendo                     = int( posiTxs[idTxEnMovimiento].x + (anchoTx / 2) );
        yCentroMoviendo                     = int( posiTxs[idTxEnMovimiento].y + (altoTx  / 2) );

        // posiTxs[idTxEnMovimiento].xCentro   = xCentroMoviendo;
        // posiTxs[idTxEnMovimiento].yCentro   = yCentroMoviendo;
    


        ///////////////////////////////////////////////////////////////////////
        //posiAddrs
        ///////////////////////////////////////////////////////////////////////    
        //Recolocamos x1, y1, x2, y2 de posiAddrs
        for(let i=0; i<posiAddrs.length; i++) {

            //En idTx2 están los satélites
            if(posiAddrs[i].idTx2 == txEnMovimiento ){

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'

            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento


            //En idTx1 está el Centro
            if(posiAddrs[i].idTx1 == txEnMovimiento ){

                //Si es una entrada
                if(posiAddrs[i].io == 'I'){
                    posiAddrs[i].x2             = xCentroMoviendo;
                    posiAddrs[i].y2             = yCentroMoviendo;
                } else if(posiAddrs[i].io == 'O'){
                    posiAddrs[i].x1             = xCentroMoviendo;
                    posiAddrs[i].y1             = yCentroMoviendo;
                }//fin if(posiAddrs[j].io == 'I'
            
            }//fin  if(posiAddrs[i].idTx1 == txEnMovimiento

        }//fin for(let i=0; i<posiAddrs.length; i++)


        //recogemos la nueva posición del mouse
        // mouseXIni        = mouseX;
        // mouseYIni        = mouseY;  


    }//fin recalculaAddrParaIntersec
    
    No_habilitada_contenidoOpciones(ancho , alto)           {

        // divOpciones   = createDiv(' ') ;
        // divOpciones.position(myVentana.x + 20 ,70);
        // divOpciones.size(ancho, alto);

        // divOpciones.style('font-size', '15px');
        // divOpciones.style('color', '#ffffff');

        // divOpciones.html('Opciones', true);

        // let miMenu = "<dl>"+
        //                 "<dt>Mover Tx</dt>" +
        //                     "<dd>Click sobre Tx y arrastrar</dd>" +
        //                     "<dd>&nbsp;</dd>" +
        //                 "<dt>Marcar / Desmarcar varias Tx</dt>" +
        //                     "<dd>Shift Key sobre Txs</br></dd>" +
        //                     "<dd>&nbsp;</dd>" +
        //                 "<dt>Desplegar Tx</dt>" +
        //                     "<dd>Doble Click sobre Tx</br></dd>" +
        //                     "<dd>&nbsp;</dd>" +                           
        //              "</dl>";
        // divOpciones.html(miMenu, true);
        

    }//fin contenidoOpciones  

    No_utilizada_indexArbolPosi()                           {

        indexArbolTxs    = Array();
        indexArbolAddrs  = Array();
        indexArbolMulti  = Array();

        let buscado, buscado1, idTx1, idTx2, idAddr, idMulti;
        let resulMulti = Array();

        //Indexa arbol
        for(let i=0; i<arbolTxsAddrs.length; i++) {
            
            //Buscando en posiTxs
            ///////////////////////////////////
            buscado = arbolTxsAddrs[i].rama[0];
            for(let j=0; j<posiTxs.length; j++) {
                if(posiTxs[j].idTx == buscado ){
                    idTx1 = j;
                    break;
                }//fin if(posiTxs[j].idTx == buscado 

            }//fin for(let j=0; j<posiTxs.length; j+

            buscado = arbolTxsAddrs[i].rama[2];
            for(let j=0; j<posiTxs.length; j++) {
                if(posiTxs[j].idTx == buscado ){
                    idTx2 = j;
                    break;
                }//fin if(posiTxs[j].idTx == buscado 

            }//fin for(let j=0; j<posiTxs.length; j+

            //Agrega en indexArbolTxs
            indexArbolTxs.push({ 
                'indexArbol' : i,
                'indexPosiTx': [idTx1, idTx2]

            });


            //Buscando en posiAddrs
            ///////////////////////////////////
            buscado = arbolTxsAddrs[i].rama[1];
            for(let j=0; j<posiAddrs.length; j++) {
                if(posiAddrs[j].idAddr == buscado ){
                    idAddr = j;
                    break;
                }//fin if(posiTxs[j].idTx == buscado 

            }//fin for(let j=0; j<posiTxs.length; j+

            //Agrega en indexArbolAddrs
            indexArbolAddrs.push({ 
                'indexArbol'    : i,
                'indexPosiAddr' : idAddr

            });


            //Buscando en multiTxs
            ///////////////////////////////////
            if ( arbolTxsAddrs[i].tipo == '1aN' ){ 
                buscado     =  arbolTxsAddrs[i].rama[0];
                buscado1    =  arbolTxsAddrs[i].rama[1];
                resulMulti  = Array();
                for(let j=0; j<multiTxs.length; j++) {
                    if((multiTxs[j].rama[0] == buscado ) &&
                       (multiTxs[j].rama[1] == buscado1 )
                    ){
                        resulMulti.push(j);
                    }//fin if(posiTxs[j].idTx == buscado 

                }//fin for(let j=0; j<posiTxs.length; j+

                //Agrega en indexArbolMulti
                indexArbolMulti.push({ 
                    'indexArbol'    : i,
                    'indexMultiTxs' : resulMulti
                });

            }//fin 


        }//fin for(let i=0; i<arbolTxsAddrs.length; i++)

    }//fin indexArbolPosi()

    kk_recalculaTodosTxsAddrs()                             {

        let   esOk;
            

        for( let i=0; i<posiTxs.length; i++) {


    
            // esOk  = txsPulsadas.find (element => element  === posiTxs[i]);

            // if( !esOk ) continue;

            this.recalculaTxAddr( posiTxs[i].idTx, i ) ;
            mouseXIni        = mouseX;
            mouseYIni        = mouseY;

        }//fin for( let i=0; i<posiTxs.length; i++)

    }//fin recalculaTodosTxsAddrs

    

    saveJSON()                                              {
        
        let data = {
                    'posiTxs'           : posiTxs , 
                    'posiAddrs'         : posiAddrs,
                    'anchoTx'           : anchoTx,
                    'altoTx'            : altoTx,
                    'radioSatelites'    : radioSatelites,
                    'mostrarSombra'     : mostrarSombra,
                    'mostrarRayado'     : mostrarRayado,
                   };

        //Salva en fichero externo  un Item por Tx
        saveJSON(data, idTx + ".json");  
        
        //Salva en memoria interna del navegador un Item por Tx
        storeItem(idTx , data);

    }//fin saveJSON


}// fin de class Bchain  



function myTime(time)                                       {
    let date = new Date(time * 1000);
    const months = ["Ene.", "Feb.", "Mar.", "Abril", "Mayo", "Jun.", 
                    "Jul.", "Agos.", "Sept.", "Oct.", "Nov.", "Dic."];
      
    return date.getDate() + '/' + 
           months[date.getMonth()] +'/'+ 
           date.getFullYear() + ' ' +
           date.getHours() + ':' + 
           date.getMinutes();
    //      return date;
}//fin miTime


function cambiaVideo( video )                               {

    videoTrab       = sitioVideosAyuda + video;

    if(pantallaVideo){
        pantallaVideo.remove();
    }//fin if(pantallaVideo)

    //Colocamos el vídeo, literal y otón a la altura de mouseY
    if (mouseY < 140) {
        yPantallaVideo = 140;
    } else {
        yPantallaVideo = mouseY;
    }//fin if (mouseY < 140)

    literalAyuda.position(490 , yPantallaVideo - 60 ); 

    playing         = true;
    pantallaVideo   = createVideo( videoTrab );
    pantallaVideo.id("idPantallaVideo");
    pantallaVideo.addClass("pantallaVideo");
    pantallaVideo.position(490, yPantallaVideo );
    pantallaVideo.size(700, 400);
    pantallaVideo.loop();
    botonPlay.html('pausa');

    botonPlay.position(490, yPantallaVideo + 420 );

}//fin cambiaVideo


       //let fs = requiere('fs');
        //data     = JSON.stringify(data);
        //storeItem('myTx', data); 
               
        // data     = JSON.stringify(data);
        // fs.writeFile('tx.json', data);

        // data     = JSON.stringify(data);

        // let bl = new Blob([data], {
        //    type: "text/html"
        // });

        // let a = document.createElement("a");
        // a.href = URL.createObjectURL(bl);
        // a.download = idTx + ".json";
        // a.hidden = true;
        // document.body.appendChild(a);
        // a.innerHTML = "someinnerhtml";
        // a.click();