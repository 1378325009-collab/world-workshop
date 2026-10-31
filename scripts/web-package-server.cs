using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

public sealed class WorldWorkshopWebServer
{
    private static readonly TimeSpan ClientHeartbeatExpiry = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan LastClientCloseDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan InitialConnectionTimeout = TimeSpan.FromSeconds(90);

    private readonly string rootPath;
    private readonly string rootPrefix;
    private readonly TcpListener listener;
    private readonly Thread acceptThread;
    private readonly object clientLock = new object();
    private readonly Dictionary<string, DateTime> activeClients = new Dictionary<string, DateTime>();
    private readonly DateTime startedAt;
    private DateTime? noClientsSince;
    private bool hasSeenClient;
    private volatile bool stopping;

    public int Port { get; private set; }
    public bool StartupTimedOut { get; private set; }

    public bool ShouldStop
    {
        get
        {
            DateTime now = DateTime.UtcNow;
            lock (clientLock)
            {
                PruneStaleClients(now);

                if (!hasSeenClient)
                {
                    if (now - startedAt >= InitialConnectionTimeout)
                    {
                        StartupTimedOut = true;
                        return true;
                    }
                    return false;
                }

                if (activeClients.Count > 0) return false;
                if (!noClientsSince.HasValue) noClientsSince = now;
                return now - noClientsSince.Value >= LastClientCloseDelay;
            }
        }
    }

    public WorldWorkshopWebServer(string webRoot, int preferredPort)
    {
        rootPath = Path.GetFullPath(webRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        rootPrefix = rootPath + Path.DirectorySeparatorChar;
        startedAt = DateTime.UtcNow;

        for (int port = preferredPort; port < preferredPort + 32; port++)
        {
            TcpListener candidate = new TcpListener(IPAddress.Loopback, port);
            try
            {
                candidate.Start();
                listener = candidate;
                Port = port;
                break;
            }
            catch (SocketException error)
            {
                candidate.Stop();
                if (error.SocketErrorCode != SocketError.AddressAlreadyInUse)
                {
                    throw;
                }
            }
        }

        if (listener == null)
        {
            throw new InvalidOperationException("8765–8796 端口都在使用中。请关闭其他服务后重试。");
        }

        acceptThread = new Thread(AcceptLoop);
        acceptThread.IsBackground = true;
    }

    public void Start()
    {
        acceptThread.Start();
    }

    public void Stop()
    {
        stopping = true;
        try { listener.Stop(); } catch { }
        if (acceptThread.IsAlive)
        {
            acceptThread.Join(1000);
        }
    }

    private void AcceptLoop()
    {
        while (!stopping)
        {
            TcpClient client;
            try
            {
                client = listener.AcceptTcpClient();
            }
            catch (SocketException)
            {
                if (stopping) return;
                continue;
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            ThreadPool.QueueUserWorkItem(new WaitCallback(HandleClient), client);
        }
    }

    private void HandleClient(object state)
    {
        using (TcpClient client = (TcpClient)state)
        {
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 30000;
                using (NetworkStream stream = client.GetStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
                {
                    string requestLine = reader.ReadLine();
                    if (String.IsNullOrEmpty(requestLine)) return;

                    string[] parts = requestLine.Split(new char[] { ' ' }, 3);
                    if (parts.Length < 2)
                    {
                        SendText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求格式无效。", false);
                        return;
                    }

                    string method = parts[0].ToUpperInvariant();
                    bool headOnly = method == "HEAD";
                    if (method != "GET" && !headOnly && method != "POST")
                    {
                        SendText(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", "仅支持 GET、HEAD 和页面生命周期 POST。", false);
                        return;
                    }

                    string headerLine;
                    while ((headerLine = reader.ReadLine()) != null && headerLine.Length > 0) { }

                    Uri requestUri;
                    try
                    {
                        requestUri = new Uri(new Uri("http://127.0.0.1/"), parts[1]);
                    }
                    catch
                    {
                        SendText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求地址无效。", headOnly);
                        return;
                    }

                    if (method == "POST")
                    {
                        string clientId;
                        bool closing;
                        if (!TryParseLifecyclePath(requestUri.AbsolutePath, out clientId, out closing))
                        {
                            SendText(stream, 404, "Not Found", "text/plain; charset=utf-8", "未找到请求的接口。", false);
                            return;
                        }

                        if (closing) CloseClient(clientId);
                        else RegisterClient(clientId);

                        SendText(stream, 200, "OK", "text/plain; charset=utf-8", "OK", false);
                        return;
                    }

                    if (requestUri.AbsolutePath == "/__worldworkshop_health")
                    {
                        SendText(stream, 200, "OK", "text/plain; charset=utf-8", "WorldWorkshop local server", headOnly);
                        return;
                    }

                    string decodedPath;
                    try
                    {
                        decodedPath = Uri.UnescapeDataString(requestUri.AbsolutePath);
                    }
                    catch
                    {
                        SendText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求路径无效。", headOnly);
                        return;
                    }

                    if (decodedPath.IndexOf('\0') >= 0)
                    {
                        SendText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求路径无效。", headOnly);
                        return;
                    }

                    string relativePath = decodedPath.TrimStart('/', '\\')
                        .Replace('/', Path.DirectorySeparatorChar)
                        .Replace('\\', Path.DirectorySeparatorChar);
                    string filePath;
                    try
                    {
                        filePath = Path.GetFullPath(Path.Combine(rootPath, relativePath));
                    }
                    catch
                    {
                        SendText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求路径无效。", headOnly);
                        return;
                    }

                    if (!filePath.Equals(rootPath, StringComparison.OrdinalIgnoreCase) &&
                        !filePath.StartsWith(rootPrefix, StringComparison.OrdinalIgnoreCase))
                    {
                        SendText(stream, 403, "Forbidden", "text/plain; charset=utf-8", "禁止访问此路径。", headOnly);
                        return;
                    }

                    if (Directory.Exists(filePath)) filePath = Path.Combine(filePath, "index.html");
                    if (!File.Exists(filePath))
                    {
                        SendText(stream, 404, "Not Found", "text/plain; charset=utf-8", "未找到请求的文件。", headOnly);
                        return;
                    }

                    byte[] content = File.ReadAllBytes(filePath);
                    SendBytes(stream, 200, "OK", GetContentType(filePath), content, headOnly);
                }
            }
            catch (IOException) { }
            catch (SocketException) { }
            catch (ObjectDisposedException) { }
        }
    }

    private void RegisterClient(string clientId)
    {
        DateTime now = DateTime.UtcNow;
        lock (clientLock)
        {
            PruneStaleClients(now);
            activeClients[clientId] = now;
            hasSeenClient = true;
            noClientsSince = null;
        }
    }

    private void CloseClient(string clientId)
    {
        DateTime now = DateTime.UtcNow;
        lock (clientLock)
        {
            PruneStaleClients(now);
            activeClients.Remove(clientId);
            if (hasSeenClient && activeClients.Count == 0 && !noClientsSince.HasValue)
            {
                noClientsSince = now;
            }
        }
    }

    private void PruneStaleClients(DateTime now)
    {
        List<string> expired = new List<string>();
        foreach (KeyValuePair<string, DateTime> client in activeClients)
        {
            if (now - client.Value >= ClientHeartbeatExpiry) expired.Add(client.Key);
        }
        foreach (string clientId in expired) activeClients.Remove(clientId);

        if (hasSeenClient && activeClients.Count == 0 && !noClientsSince.HasValue)
        {
            noClientsSince = now;
        }
    }

    private static bool TryParseLifecyclePath(string absolutePath, out string clientId, out bool closing)
    {
        clientId = null;
        closing = false;
        const string prefix = "/__worldworkshop_lifecycle/";
        if (!absolutePath.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;

        string[] parts = absolutePath.Substring(prefix.Length).Split('/');
        if (parts.Length != 2) return false;

        Guid parsedId;
        if (!Guid.TryParse(parts[1], out parsedId)) return false;
        if (String.Equals(parts[0], "heartbeat", StringComparison.OrdinalIgnoreCase))
        {
            closing = false;
        }
        else if (String.Equals(parts[0], "close", StringComparison.OrdinalIgnoreCase))
        {
            closing = true;
        }
        else
        {
            return false;
        }

        clientId = parsedId.ToString("N");
        return true;
    }

    private static string GetContentType(string filePath)
    {
        switch (Path.GetExtension(filePath).ToLowerInvariant())
        {
            case ".css": return "text/css; charset=utf-8";
            case ".gif": return "image/gif";
            case ".html": return "text/html; charset=utf-8";
            case ".ico": return "image/x-icon";
            case ".jpeg":
            case ".jpg": return "image/jpeg";
            case ".js":
            case ".mjs": return "text/javascript; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".map": return "application/json; charset=utf-8";
            case ".mp3": return "audio/mpeg";
            case ".mp4": return "video/mp4";
            case ".pdf": return "application/pdf";
            case ".png": return "image/png";
            case ".svg": return "image/svg+xml";
            case ".txt": return "text/plain; charset=utf-8";
            case ".wasm": return "application/wasm";
            case ".webmanifest": return "application/manifest+json; charset=utf-8";
            case ".webp": return "image/webp";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            default: return "application/octet-stream";
        }
    }

    private static void SendText(NetworkStream stream, int status, string reason, string contentType, string text, bool headOnly)
    {
        SendBytes(stream, status, reason, contentType, Encoding.UTF8.GetBytes(text), headOnly);
    }

    private static void SendBytes(NetworkStream stream, int status, string reason, string contentType, byte[] content, bool headOnly)
    {
        string header = "HTTP/1.1 " + status + " " + reason + "\r\n" +
            "Content-Type: " + contentType + "\r\n" +
            "Content-Length: " + content.Length + "\r\n" +
            "Cache-Control: no-cache\r\n" +
            "X-Content-Type-Options: nosniff\r\n" +
            "Connection: close\r\n\r\n";
        byte[] headerBytes = Encoding.ASCII.GetBytes(header);
        stream.Write(headerBytes, 0, headerBytes.Length);
        if (!headOnly && content.Length > 0) stream.Write(content, 0, content.Length);
    }
}
