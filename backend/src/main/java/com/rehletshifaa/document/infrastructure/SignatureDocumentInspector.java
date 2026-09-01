package com.rehletshifaa.document.infrastructure;

import com.rehletshifaa.document.application.DocumentInspectionPort;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

@Component
@ConditionalOnProperty(name="app.storage.scanning-mode",havingValue="signature",matchIfMissing=true)
public class SignatureDocumentInspector implements DocumentInspectionPort {
    private static final byte[] PDF="%PDF-".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PNG=new byte[]{(byte)0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a};
    private static final byte[] JPG=new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff};
    @Override public InspectionResult inspect(byte[] content,String type){
        if(content==null||content.length==0)return new InspectionResult(false,"EMPTY_FILE");
        String ascii=new String(content,StandardCharsets.ISO_8859_1);
        if(ascii.contains("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"))return new InspectionResult(false,"MALWARE_SIGNATURE");
        boolean signature=switch(type){case "application/pdf"->startsWith(content,PDF);case "image/png"->startsWith(content,PNG);case "image/jpeg"->startsWith(content,JPG);default->false;};
        return signature?new InspectionResult(true,"CLEAN"):new InspectionResult(false,"CONTENT_TYPE_MISMATCH");
    }
    private boolean startsWith(byte[] content,byte[] expected){return content.length>=expected.length&&Arrays.equals(Arrays.copyOf(content,expected.length),expected);}
}
