package com.rehletshifaa.document.infrastructure;

import com.rehletshifaa.document.application.DocumentInspectionPort;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import java.io.*;
import java.net.*;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

@Component
@ConditionalOnProperty(name="app.storage.scanning-mode",havingValue="clamav")
public class ClamAvDocumentInspector implements DocumentInspectionPort {
    private final String host; private final int port; private final int timeout;
    public ClamAvDocumentInspector(@Value("${app.storage.clamav.host}")String host,@Value("${app.storage.clamav.port:3310}")int port,@Value("${app.storage.clamav.timeout-milliseconds:10000}")int timeout){this.host=host;this.port=port;this.timeout=timeout;}
    @Override public InspectionResult inspect(byte[] content,String ignored){
        try(Socket socket=new Socket()){socket.connect(new InetSocketAddress(host,port),timeout);socket.setSoTimeout(timeout);OutputStream out=socket.getOutputStream();out.write("zINSTREAM\0".getBytes(StandardCharsets.US_ASCII));int offset=0;while(offset<content.length){int length=Math.min(8192,content.length-offset);out.write(ByteBuffer.allocate(4).putInt(length).array());out.write(content,offset,length);offset+=length;}out.write(new byte[4]);out.flush();String response=new String(socket.getInputStream().readNBytes(2048),StandardCharsets.UTF_8);if(response.contains("OK"))return new InspectionResult(true,"CLEAN");if(response.contains("FOUND"))return new InspectionResult(false,"MALWARE_FOUND");return new InspectionResult(false,"SCANNER_ERROR");}
        catch(IOException e){return new InspectionResult(false,"SCANNER_UNAVAILABLE");}
    }
}
