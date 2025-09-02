declare namespace HttpcTest {
    interface TestCase {
        title: string;
        method: string;
        url: string;
        headers?: Map<string, string>;
        body?: string;
        expected_status: number;
        expected_body_substr?: string;
        expected_headers?: Record<string, string>;
    }
}
