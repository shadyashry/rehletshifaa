package com.rehletshifaa.clinic.application;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.rehletshifaa.clinic.infrastructure.ConsultantDirectoryRepository;
import com.rehletshifaa.clinic.infrastructure.ConsultantDirectoryRepository.Listed;
import com.rehletshifaa.shared.api.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
@Service
@Transactional(readOnly=true)
public class PublicConsultantQueryService {
    private final ConsultantDirectoryRepository directory;
    private final ObjectMapper json;
    public PublicConsultantQueryService(ConsultantDirectoryRepository directory,ObjectMapper json) { this.directory=directory; this.json=json; }
    public List<JsonNode> list(String locale) { return directory.findListed().stream().map(row -> view(row,"ar".equals(locale))).toList(); }
    public JsonNode one(String slug,String locale) { return view(directory.findListed(slug).orElseThrow(() -> new ApiException(404,"CONSULTANT_NOT_FOUND","No such Consultant")),"ar".equals(locale)); }
    private JsonNode view(Listed row, boolean ar) {
        try {
            ObjectNode node = (ObjectNode) json.readTree(ar ? row.getContentAr() : row.getContentEn());
            node.put("slug", row.getSlug());
            node.put("careAreaHref", row.getCareArea());
            node.put("careAreaLabel", ar ? row.getCareAreaAr() : row.getCareAreaEn());
            return node;
        } catch (Exception e) {
            throw new IllegalStateException("Unreadable directory content for " + row.getSlug(), e);
        }
    }
}
