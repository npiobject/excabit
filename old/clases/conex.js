//Trabaja con NowNodes
//https://documenter.getpostman.com/view/13630829/TVmFkLwy#53f3a035-507d-47c1-81c2-f0dea88dacb9
//
//Aparartados: GET get transaction y GET get address


class Conex{

    constructor(url){

        this.url            = url;
        this.respuesta      = Array();

        this.myHeaders      = new Headers();
        //this.myHeaders.append("api-key", "CLAVE-REVOCADA-VER-BUG-001");
        this.myHeaders.append("api-key", "CLAVE-REVOCADA-VER-BUG-001");
        this.requestOptions = {
                                method        : 'GET',
                                headers       : this.myHeaders,
                                redirect      : 'follow',
                                
                              };

    }//fin constructor

    async getTxNN ( idTx ) {

        let datos;

        //Ver si ya tenemos los datos bajados
        for(let i=0; i<datosTxNN.length; i++) {

            //Si los encontramos los devolvemos
            if( datosTxNN[i].idTx == idTx ){
                datos = datosTxNN[i].datos;
                return datos;

            }//fin if( datosTxNN[i].idTx == idTx

        }//fin for(let i=0; i<datosTxNN.length; i++)


        await fetch( "https://btcbook.nownodes.io/api/v2/tx/" + idTx , this.requestOptions )
            .then(response => {
                               datos = response.json();
                               divGifAnimado.show();  
                              })
            // .catch(error => alert( error))
            .catch(error => console.log('Error: ', error));
        

        //Añadimos los datos
        datosTxNN.push({ 
                            'idTx'       : idTx ,  
                            'datos'      : datos,  
                        });


        return datos;

    }// fin de getTxNN ( idTx )       


    async getAddrNN(idAddr) {

        let datos, datosUtxo;

        await fetch( "https://btcbook.nownodes.io/api/v2/address/" + idAddr , this.requestOptions )
            .then(response => { 
                                datos = response.json();
                                divGifAnimado.show();
                              })
            .catch(error => alert( error))
            .catch(error => console.log('error', error));

        //UTXO
        // await fetch( "https://btcbook.nownodes.io/api/v2/utxo/" + idAddr , this.requestOptions )
        //     .then(response => { 
        //                         datosUtxo = response.json();
        //                         divGifAnimado.show();
        //                       })
        //     .catch(error => alert( error))
        //     .catch(error => console.log('error', error));
        
        
        // //Añadimos los datos
        // datosAddrNN.push({ 
        //     'idAddr'        : idAddr ,  
        //     'datos'         : datos,  
        //     'datosUtxo'     : datosUtxo,
        // });

                    
        return datos;
  
    }//fin getAddrNN(idAddr)


    async getUtxoNN( idAddr ) {

        let datos;
        await fetch( "https://btcbook.nownodes.io/api/v2/utxo/" + idAddr , this.requestOptions )
            .then(response => { 
                                datos = response.json();
                                divGifAnimado.show();
                              })
            .catch(error => alert( error))
            .catch(error => console.log('error', error));

                
        return datos;
  
    }//fin getAddrNN(idAddr)
    










    // async getTx ( idTx ) {

    //     this.url               = 'https://blockchain.info/rawtx/' + idTx ;
    //     this.respuesta         = await axios.get( this.url );

    //     return this.respuesta ;
    
    // }// fin de getTx    


    // async getAddr(idAddr) {

    //     this.url               = 'https://blockchain.info/rawaddr/' + idAddr;
    //     this.respuesta         = await axios.get( this.url );
            
    //     return this.respuesta;
        
    // }//fin async getAddr(idAddr)
    


  

} //fin de class Conex