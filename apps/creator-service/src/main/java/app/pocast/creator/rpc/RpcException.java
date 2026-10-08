package app.pocast.creator.rpc;

public final class RpcException extends RuntimeException {

	private final int statusCode;

	public RpcException(int statusCode, String message) {
		super(message, null, false, false);
		this.statusCode = statusCode;
	}

	public static RpcException badRequest(String message) {
		return new RpcException(400, message);
	}

	public static RpcException notFound(String message) {
		return new RpcException(404, message);
	}

	public static RpcException conflict(String message) {
		return new RpcException(409, message);
	}

	public int statusCode() {
		return statusCode;
	}
}
